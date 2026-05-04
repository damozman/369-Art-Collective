#!/usr/bin/env tsx
/**
 * Backfill Printify Products for Approved Artworks
 * 
 * Creates Printify products for all approved artworks that have Shopify products
 * but are missing Printify products. After creating each product, triggers mockup sync.
 * 
 * Usage:
 *   tsx server/scripts/backfill-printify-products.ts
 *   
 * Options:
 *   --dry-run    Show what would be processed without making changes
 *   --limit=N    Process only first N artworks (for testing)
 */

import { config } from "dotenv";
import { storage } from "../storage";
import { createWallArtProducts } from "../lib/printify-service";
import { syncPrintifyMockupsWithRetry } from "../lib/printify-mockup-sync";
import { isPrintifyConfigured } from "../lib/printify";
import { isShopifyConfigured } from "../lib/shopify";

// Load environment variables
config();

// ANSI color codes for terminal output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[36m",
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function header(message: string) {
  console.log();
  log("═".repeat(70), colors.blue);
  log(`  ${message}`, colors.bright + colors.blue);
  log("═".repeat(70), colors.blue);
  console.log();
}

async function backfillPrintifyProducts() {
  header("Printify Product Backfill Script");

  // Parse command line arguments
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limitArg = args.find(arg => arg.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1]) : undefined;

  if (dryRun) {
    log("⚠️  DRY RUN MODE - No changes will be made", colors.yellow);
    console.log();
  }

  // Step 1: Validate API configuration
  log("[1/6] Validating API configuration...", colors.blue);
  
  if (!isPrintifyConfigured()) {
    log("✗ Printify is not configured", colors.red);
    log("  Set PRINTIFY_API_KEY and PRINTIFY_SHOP_ID environment variables", colors.dim);
    process.exit(1);
  }
  
  if (!isShopifyConfigured()) {
    log("✗ Shopify is not configured", colors.red);
    log("  Set SHOPIFY_SHOP_URL and SHOPIFY_ACCESS_TOKEN environment variables", colors.dim);
    process.exit(1);
  }
  
  log("✓ API configuration valid", colors.green);

  // Step 2: Query eligible artworks
  log("\n[2/6] Querying database for eligible artworks...", colors.blue);
  
  const allArtworks = await storage.getAllArtworks();
  
  // Filter for approved artworks with Shopify product but no Printify product
  const eligibleArtworks = allArtworks.filter(artwork => 
    artwork.status === "approved" &&
    artwork.shopifyProductId !== null &&
    artwork.printifyProductId === null &&
    artwork.archivedAt === null
  );

  log(`  Total artworks: ${allArtworks.length}`, colors.dim);
  log(`  Approved with Shopify: ${allArtworks.filter(a => a.status === "approved" && a.shopifyProductId).length}`, colors.dim);
  log(`  Missing Printify products: ${eligibleArtworks.length}`, colors.dim);
  
  if (eligibleArtworks.length === 0) {
    log("\n✓ No artworks need Printify products - all set!", colors.green);
    return;
  }

  const toProcess = limit ? eligibleArtworks.slice(0, limit) : eligibleArtworks;
  
  if (limit && toProcess.length < eligibleArtworks.length) {
    log(`  Processing ${toProcess.length} of ${eligibleArtworks.length} (limit applied)`, colors.yellow);
  }
  
  log(`✓ Found ${toProcess.length} artworks to process`, colors.green);

  if (dryRun) {
    log("\n[DRY RUN] Would process these artworks:", colors.yellow);
    toProcess.forEach((artwork, i) => {
      log(`  ${i + 1}. ${artwork.title} (${artwork.id})`, colors.dim);
    });
    log("\nRun without --dry-run to execute", colors.yellow);
    return;
  }

  // Step 3: Get base URL for image URLs
  log("\n[3/6] Determining base URL...", colors.blue);
  
  const replitDomain = process.env.REPLIT_DOMAINS 
    ? process.env.REPLIT_DOMAINS.split(',').map(d => d.trim()).find(d => !d.includes('-')) || process.env.REPLIT_DOMAINS.split(',')[0].trim()
    : null;
  
  const baseUrl = replitDomain
    ? `https://${replitDomain}`
    : `http://localhost:${process.env.PORT || 5000}`;
  
  log(`  Base URL: ${baseUrl}`, colors.dim);
  log("✓ Base URL configured", colors.green);

  // Step 4: Process artworks
  log(`\n[4/6] Processing ${toProcess.length} artworks...`, colors.blue);
  console.log();

  let successCount = 0;
  let failureCount = 0;
  const errors: Array<{ artwork: string; error: string }> = [];

  for (let i = 0; i < toProcess.length; i++) {
    const artwork = toProcess[i];
    const progressPrefix = `[${i + 1}/${toProcess.length}]`;
    
    log(`${progressPrefix} ${artwork.title}`, colors.bright);
    log(`  Artwork ID: ${artwork.id}`, colors.dim);
    log(`  Shopify Product: ${artwork.shopifyProductId}`, colors.dim);

    try {
      // Build absolute image URL
      const imageUrl = artwork.imageUrl.startsWith("http") 
        ? artwork.imageUrl 
        : `${baseUrl}${artwork.imageUrl}`;
      
      log(`  Creating Printify product...`, colors.dim);
      
      // Create Printify product (same as approval workflow)
      const printifyResult = await createWallArtProducts(
        imageUrl,
        artwork.title,
        0,
        0,
        artwork.description || undefined
      );

      const printifyProductId = printifyResult.printifyProductId;
      const printifyImageId = printifyResult.printifyImageId;
      
      log(`  Printify Product: ${printifyProductId}`, colors.dim);
      
      // Update database
      log(`  Updating database...`, colors.dim);
      await storage.updateArtwork(artwork.id, {
        printifyProductId,
        printifyImageId,
      });

      // Trigger mockup sync (non-blocking, same as approval workflow)
      log(`  Triggering mockup sync...`, colors.dim);
      syncPrintifyMockupsWithRetry(
        process.env.PRINTIFY_SHOP_ID!,
        printifyProductId,
        artwork.shopifyProductId!
      ).catch(err => {
        console.warn(`  Mockup sync failed for ${artwork.title}:`, err.message);
      });

      log(`  ✓ Success`, colors.green);
      successCount++;
      
      // Small delay to avoid rate limiting
      if (i < toProcess.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
    } catch (error: any) {
      log(`  ✗ Failed: ${error.message}`, colors.red);
      failureCount++;
      errors.push({
        artwork: artwork.title,
        error: error.message,
      });
    }
    
    console.log();
  }

  // Step 5: Display summary
  header("Backfill Complete");
  
  log(`✓ Successfully processed: ${successCount}`, colors.green);
  if (failureCount > 0) {
    log(`✗ Failed: ${failureCount}`, colors.red);
  }
  log(`  Total: ${toProcess.length}`, colors.dim);

  // Step 6: Display errors if any
  if (errors.length > 0) {
    log("\n[6/6] Errors encountered:", colors.yellow);
    errors.forEach(({ artwork, error }) => {
      log(`  • ${artwork}: ${error}`, colors.red);
    });
  } else {
    log("\n✓ No errors!", colors.green);
  }

  console.log();
  log("📋 Next steps:", colors.blue);
  log("  1. Wait 2-3 minutes for mockup images to sync", colors.dim);
  log("  2. Visit product pages on Shopify to verify mockups appear", colors.dim);
  log("  3. Each product should have ~4 images (1 original + 3 mockups)", colors.dim);
  console.log();
}

// Run the script
backfillPrintifyProducts()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("\nFatal error:", error);
    process.exit(1);
  });
