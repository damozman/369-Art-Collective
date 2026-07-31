/**
 * Complete System Cleanup Script
 * 
 * Deletes all artist/artwork data from:
 * - Printify (products)
 * - Shopify (products)
 * - Replit Database (all artist/artwork/order data)
 * - Object Storage (artwork images)
 * 
 * Then creates fresh admin accounts for testing.
 * 
 * DESTRUCTIVE OPERATION - USE WITH CAUTION
 */

import { db } from "../lib/db";
import { 
  artists, artworks, admins, portfolioSubmissions, upscaleJobs, upscaleUsage,
  adminActions, orders, passwordResetTokens, violationReports,
  sales, referrals, artistReferrals, payouts, stripeWebhookEvents,
  emailLogs, affiliateClicks, affiliateConversions,
  influencers, artworkApprovalLog,
  waitlist, testimonials
} from "../../shared/schema";
import { ObjectStorageService } from "../objectStorage";
import * as bcrypt from "bcryptjs";
import * as readline from "readline/promises";

const SHOPIFY_SHOP_URL = process.env.SHOPIFY_SHOP_URL || "";
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || "";
const PRINTIFY_API_KEY = process.env.PRINTIFY_API_KEY || "";
const PRINTIFY_SHOP_ID = process.env.PRINTIFY_SHOP_ID || "";
const PRINTIFY_API_TOKEN = process.env.PRINTIFY_API_TOKEN || "";

interface CleanupStats {
  printifyDeleted: number;
  printifyFailed: number;
  shopifyDeleted: number;
  shopifyFailed: number;
  dbRecordsDeleted: { [table: string]: number };
  objectStorageCleaned: number;
  adminsCreated: number;
}

const stats: CleanupStats = {
  printifyDeleted: 0,
  printifyFailed: 0,
  shopifyDeleted: 0,
  shopifyFailed: 0,
  dbRecordsDeleted: {},
  objectStorageCleaned: 0,
  adminsCreated: 0
};

// Retry helper with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      const delay = baseDelay * Math.pow(2, i);
      console.log(`  Retry ${i + 1}/${maxRetries} after ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Retry failed');
}

// Delete Printify product
async function deletePrintifyProduct(productId: string): Promise<boolean> {
  try {
    await retryWithBackoff(async () => {
      const response = await fetch(
        `https://api.printify.com/v1/shops/14883676/products/${productId}.json`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${PRINTIFY_API_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (!response.ok && response.status !== 404) {
        throw new Error(`Printify API error: ${response.status}`);
      }
    });
    
    stats.printifyDeleted++;
    return true;
  } catch (error) {
    console.error(`  ❌ Failed to delete Printify product ${productId}:`, error);
    stats.printifyFailed++;
    return false;
  }
}

// Delete Shopify product
async function deleteShopifyProduct(productId: string): Promise<boolean> {
  try {
    await retryWithBackoff(async () => {
      const response = await fetch(
        `https://${SHOPIFY_SHOP_URL}/admin/api/2024-04/products/${productId}.json`,
        {
          method: 'DELETE',
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (!response.ok && response.status !== 404) {
        throw new Error(`Shopify API error: ${response.status}`);
      }
    });
    
    stats.shopifyDeleted++;
    return true;
  } catch (error) {
    console.error(`  ❌ Failed to delete Shopify product ${productId}:`, error);
    stats.shopifyFailed++;
    return false;
  }
}

// Delete from database table
async function deleteFromTable(table: any, tableName: string): Promise<number> {
  try {
    const result = await db.delete(table);
    const count = result.rowCount || 0;
    stats.dbRecordsDeleted[tableName] = count;
    return count;
  } catch (error) {
    console.error(`  ❌ Failed to delete from ${tableName}:`, error);
    stats.dbRecordsDeleted[tableName] = 0;
    return 0;
  }
}

// Main cleanup function
async function cleanup() {
  console.log("🧹 COMPLETE SYSTEM CLEANUP");
  console.log("═══════════════════════════════════════\n");
  
  // Step 1: Get all artwork data
  console.log("📋 Step 1: Gathering data...");
  const allArtworks = await db.select({
    id: artworks.id,
    title: artworks.title,
    imageUrl: artworks.imageUrl,
    shopifyProductId: artworks.shopifyProductId,
    printifyProductId: artworks.printifyProductId
  }).from(artworks);
  
  console.log(`  Found ${allArtworks.length} artworks`);
  const printifyProducts = allArtworks.filter(a => a.printifyProductId).map(a => a.printifyProductId!);
  const shopifyProducts = allArtworks.filter(a => a.shopifyProductId).map(a => a.shopifyProductId!);
  console.log(`  - ${printifyProducts.length} Printify products`);
  console.log(`  - ${shopifyProducts.length} Shopify products\n`);
  
  // Step 2: Delete from Printify
  if (printifyProducts.length > 0) {
    if (!PRINTIFY_API_KEY) {
      console.log("⏭️  Step 2: Skipping Printify deletion (PRINTIFY_API_KEY not configured)\n");
      stats.printifyFailed = printifyProducts.length;
    } else {
      console.log("🗑️  Step 2: Deleting Printify products...");
      for (const productId of printifyProducts) {
        process.stdout.write(`  Deleting ${productId}...`);
        const success = await deletePrintifyProduct(productId);
        console.log(success ? " ✅" : " ❌");
      }
      console.log(`  Deleted: ${stats.printifyDeleted}, Failed: ${stats.printifyFailed}\n`);
    }
  } else {
    console.log("⏭️  Step 2: No Printify products to delete\n");
  }
  
  // Step 3: Delete from Shopify
  if (shopifyProducts.length > 0) {
    console.log("🗑️  Step 3: Deleting Shopify products...");
    for (const productId of shopifyProducts) {
      process.stdout.write(`  Deleting ${productId}...`);
      const success = await deleteShopifyProduct(productId);
      console.log(success ? " ✅" : " ❌");
    }
    console.log(`  Deleted: ${stats.shopifyDeleted}, Failed: ${stats.shopifyFailed}\n`);
  } else {
    console.log("⏭️  Step 3: No Shopify products to delete\n");
  }
  
  // Step 4: Delete from database (FK-aware order)
  console.log("🗑️  Step 4: Deleting database records...");
  
  // Delete in FK-safe topological order (from architect analysis)
  await deleteFromTable(violationReports, "violation_reports");
  await deleteFromTable(artworkApprovalLog, "artwork_approval_log");
  await deleteFromTable(testimonials, "testimonials");
  await deleteFromTable(sales, "sales");
  await deleteFromTable(payouts, "payouts");
  await deleteFromTable(artistReferrals, "artist_referrals");
  await deleteFromTable(referrals, "referrals");
  await deleteFromTable(portfolioSubmissions, "portfolio_submissions");
  await deleteFromTable(upscaleUsage, "upscale_usage");
  await deleteFromTable(upscaleJobs, "upscale_jobs");
  await deleteFromTable(affiliateConversions, "affiliate_conversions");
  await deleteFromTable(affiliateClicks, "affiliate_clicks");
  await deleteFromTable(influencers, "influencers");
  await deleteFromTable(waitlist, "waitlist");
  await deleteFromTable(emailLogs, "email_logs");
  await deleteFromTable(stripeWebhookEvents, "stripe_webhook_events");
  await deleteFromTable(passwordResetTokens, "password_reset_tokens");
  await deleteFromTable(orders, "orders");
  await deleteFromTable(artworks, "artworks");
  await deleteFromTable(artists, "artists");
  await deleteFromTable(adminActions, "admin_actions");
  await deleteFromTable(admins, "admins");
  
  console.log("  Database cleanup complete\n");
  
  // Step 5: Clean object storage
  console.log("🗑️  Step 5: Cleaning object storage...");
  const storage = new ObjectStorageService();
  
  try {
    // Delete specific artwork image files
    for (const artwork of allArtworks) {
      if (artwork.imageUrl && artwork.imageUrl.startsWith('/objects/')) {
        try {
          await storage.deleteFile(artwork.imageUrl);
          stats.objectStorageCleaned++;
        } catch (error) {
          // Ignore 404 errors - file may already be deleted
        }
      }
    }
    
    console.log(`  Cleaned ${stats.objectStorageCleaned} files from object storage\n`);
  } catch (error) {
    console.error("  ❌ Object storage cleanup failed:", error);
  }
  
  // Step 6: Create new admin accounts
  console.log("👤 Step 6: Creating new admin accounts...");
  
  const tempPassword = "TempPass123!";
  const hashedPassword = await bcrypt.hash(tempPassword, 10);
  
  await db.insert(admins).values({
    email: "chris@369artcollective.com",
    password: hashedPassword,
    name: "Chris"
  });
  stats.adminsCreated++;
  console.log("  ✅ Created chris@369artcollective.com");
  
  await db.insert(admins).values({
    email: "admin@369artcollective.com",
    password: hashedPassword,
    name: "Admin"
  });
  stats.adminsCreated++;
  console.log("  ✅ Created admin@369artcollective.com");
  console.log(`  Password for both: ${tempPassword}\n`);
}

// Reconciliation report
async function generateReport() {
  console.log("\n" + "═".repeat(60));
  console.log("📊 CLEANUP RECONCILIATION REPORT");
  console.log("═".repeat(60) + "\n");
  
  console.log("External Services:");
  console.log(`  Printify products deleted: ${stats.printifyDeleted}`);
  console.log(`  Printify products failed:  ${stats.printifyFailed}`);
  console.log(`  Shopify products deleted:  ${stats.shopifyDeleted}`);
  console.log(`  Shopify products failed:   ${stats.shopifyFailed}\n`);
  
  console.log("Database:");
  for (const [table, count] of Object.entries(stats.dbRecordsDeleted)) {
    console.log(`  ${table.padEnd(30)} ${count} records`);
  }
  
  console.log(`\nObject Storage:`);
  console.log(`  Files cleaned: ${stats.objectStorageCleaned}\n`);
  
  console.log("New Accounts:");
  console.log(`  Admins created: ${stats.adminsCreated}\n`);
  
  // Verify clean state
  console.log("Verification:");
  const artistCount = await db.select().from(artists);
  const artworkCount = await db.select().from(artworks);
  const adminCount = await db.select().from(admins);
  
  console.log(`  Artists in DB:  ${artistCount.length} (should be 0)`);
  console.log(`  Artworks in DB: ${artworkCount.length} (should be 0)`);
  console.log(`  Admins in DB:   ${adminCount.length} (should be 2)\n`);
  
  const allClean = artistCount.length === 0 && artworkCount.length === 0 && adminCount.length === 2;
  console.log(allClean ? "✅ Clean state verified!" : "⚠️  Warning: Unexpected state detected");
  console.log("═".repeat(60) + "\n");
}

// Main execution
async function main() {
  // Confirmation prompt
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  console.log("\n⚠️  WARNING: This will DELETE ALL DATA from:");
  console.log("  - All Printify products");
  console.log("  - All Shopify products");
  console.log("  - All database records (artists, artworks, orders, etc.)");
  console.log("  - All object storage files (artwork images)");
  console.log("  - All admin accounts\n");
  console.log("  Then create 2 fresh admin accounts.\n");
  
  const answer = await rl.question("Type 'YES' to proceed with cleanup: ");
  rl.close();
  
  if (answer.trim() !== 'YES') {
    console.log("\n❌ Cleanup cancelled\n");
    process.exit(0);
  }
  
  console.log("\n🚀 Starting cleanup...\n");
  
  try {
    await cleanup();
    await generateReport();
    console.log("✅ Cleanup complete!\n");
  } catch (error) {
    console.error("\n❌ Cleanup failed:", error);
    process.exit(1);
  }
}

main();
