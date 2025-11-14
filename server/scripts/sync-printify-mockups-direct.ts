#!/usr/bin/env tsx
/**
 * Direct Mockup Sync: Printify → Shopify
 * 
 * Downloads mockup images from Printify and uploads them directly to Shopify
 * using base64 encoding. This bypasses Shopify's CDN download timeout issues.
 * 
 * Usage:
 *   tsx server/scripts/sync-printify-mockups-direct.ts [--limit=N] [--dry-run]
 */

import { config } from "dotenv";
import { storage } from "../storage";
import { getProductMockups, getShops } from "../lib/printify";
import { isShopifyConfigured } from "../lib/shopify";

config();

// ANSI colors
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

/**
 * Download image from URL and convert to base64
 */
async function downloadImageAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return buffer.toString('base64');
}

/**
 * Upload image to Shopify product using base64 attachment
 * This bypasses the URL download issue
 */
async function uploadImageToShopify(
  shopifyProductId: string,
  base64Image: string,
  filename: string,
  position?: number
): Promise<boolean> {
  const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL;
  const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN;
  const apiVersion = "2024-10";
  
  const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products/${shopifyProductId}/images.json`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": shopifyAccessToken!,
    },
    body: JSON.stringify({
      image: {
        attachment: base64Image,
        filename: filename,
        alt: "Product mockup",
        position: position,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Shopify API error: ${error}`);
  }

  return true;
}

async function syncMockupsForProduct(
  printifyShopId: string,
  printifyProductId: string,
  shopifyProductId: string,
  productTitle: string,
  dryRun: boolean = false
): Promise<{ success: boolean; mockupsAdded: number; errors: string[] }> {
  const result = {
    success: false,
    mockupsAdded: 0,
    errors: [] as string[],
  };

  try {
    // Get mockup images from Printify
    log(`  Fetching mockups from Printify...`, colors.dim);
    const mockups = await getProductMockups(printifyShopId, printifyProductId);
    
    if (mockups.length === 0) {
      result.errors.push("No mockups found in Printify");
      return result;
    }

    log(`  Found ${mockups.length} mockup images`, colors.dim);

    // Filter to non-default mockups (exclude the original artwork)
    const mockupsToAdd = mockups.filter(m => !m.is_default);
    
    if (mockupsToAdd.length === 0) {
      log(`  No additional mockups to add (only default image)`, colors.dim);
      result.success = true;
      return result;
    }

    log(`  Will add ${mockupsToAdd.length} mockup images`, colors.dim);

    if (dryRun) {
      log(`  [DRY RUN] Would download and upload ${mockupsToAdd.length} images`, colors.yellow);
      result.success = true;
      result.mockupsAdded = mockupsToAdd.length;
      return result;
    }

    // Download and upload each mockup
    let position = 2; // Start at position 2 (position 1 is usually the main image)
    
    for (const mockup of mockupsToAdd.slice(0, 4)) { // Limit to 4 mockups to avoid clutter
      try {
        log(`    Downloading mockup ${position - 1}/${Math.min(4, mockupsToAdd.length)}...`, colors.dim);
        
        // Download image as base64
        const base64Image = await downloadImageAsBase64(mockup.src);
        
        // Extract filename from URL
        const filename = mockup.src.split('/').pop()?.split('?')[0] || `mockup-${position}.jpg`;
        
        log(`    Uploading to Shopify...`, colors.dim);
        
        // Upload to Shopify
        await uploadImageToShopify(
          shopifyProductId,
          base64Image,
          filename,
          position
        );
        
        result.mockupsAdded++;
        position++;
        
        // Rate limiting: 500ms between uploads (Shopify allows 2 req/sec)
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error: any) {
        result.errors.push(`Mockup upload failed: ${error.message}`);
        log(`    ✗ Failed: ${error.message}`, colors.red);
      }
    }

    result.success = result.mockupsAdded > 0;
    return result;

  } catch (error: any) {
    result.errors.push(error.message);
    return result;
  }
}

async function main() {
  header("Printify Mockup Direct Sync");

  // Parse arguments
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limitArg = args.find(arg => arg.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1]) : undefined;

  if (dryRun) {
    log("⚠️  DRY RUN MODE - No images will be uploaded", colors.yellow);
    console.log();
  }

  // Validate configuration
  log("[1/5] Validating configuration...", colors.blue);
  
  if (!isShopifyConfigured()) {
    log("✗ Shopify not configured", colors.red);
    process.exit(1);
  }
  
  log("✓ Shopify configured", colors.green);
  
  // Get Printify shop ID
  log("\n[2/5] Fetching Printify shop...", colors.blue);
  const shops = await getShops();
  const printifyShopId = shops[0].id;
  log(`✓ Shop ID: ${printifyShopId}`, colors.green);

  // Get products that need mockup sync
  log("\n[3/5] Querying database...", colors.blue);
  const allArtworks = await storage.getAllArtworks();
  
  const eligibleProducts = allArtworks.filter(artwork =>
    artwork.status === "approved" &&
    artwork.printifyProductId !== null &&
    artwork.shopifyProductId !== null &&
    artwork.archivedAt === null &&
    !artwork.imageUrl.includes("placeholder") // Skip test products
  );

  log(`  Total artworks: ${allArtworks.length}`, colors.dim);
  log(`  Eligible for sync: ${eligibleProducts.length}`, colors.dim);

  const toProcess = limit ? eligibleProducts.slice(0, limit) : eligibleProducts;
  
  if (limit && toProcess.length < eligibleProducts.length) {
    log(`  Processing ${toProcess.length} of ${eligibleProducts.length} (limit applied)`, colors.yellow);
  }

  log(`✓ Found ${toProcess.length} products to sync`, colors.green);

  if (toProcess.length === 0) {
    log("\n✓ No products need syncing", colors.green);
    return;
  }

  // Process products
  log(`\n[4/5] Syncing mockups for ${toProcess.length} products...`, colors.blue);
  console.log();

  let successCount = 0;
  let failureCount = 0;
  let totalMockupsAdded = 0;
  const errors: Array<{ product: string; error: string }> = [];

  for (let i = 0; i < toProcess.length; i++) {
    const product = toProcess[i];
    const progressPrefix = `[${i + 1}/${toProcess.length}]`;
    
    log(`${progressPrefix} ${product.title}`, colors.bright);
    log(`  Printify: ${product.printifyProductId}`, colors.dim);
    log(`  Shopify: ${product.shopifyProductId}`, colors.dim);

    try {
      const result = await syncMockupsForProduct(
        printifyShopId,
        product.printifyProductId!,
        product.shopifyProductId!,
        product.title,
        dryRun
      );

      if (result.success) {
        log(`  ✓ Added ${result.mockupsAdded} mockup images`, colors.green);
        successCount++;
        totalMockupsAdded += result.mockupsAdded;
      } else {
        log(`  ✗ Failed: ${result.errors.join(", ")}`, colors.red);
        failureCount++;
        errors.push({
          product: product.title,
          error: result.errors.join(", "),
        });
      }

    } catch (error: any) {
      log(`  ✗ Error: ${error.message}`, colors.red);
      failureCount++;
      errors.push({
        product: product.title,
        error: error.message,
      });
    }

    console.log();

    // Delay between products to avoid rate limiting
    if (i < toProcess.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Summary
  header("Sync Complete");
  
  log(`✓ Successful: ${successCount}`, colors.green);
  if (failureCount > 0) {
    log(`✗ Failed: ${failureCount}`, colors.red);
  }
  log(`  Total mockups added: ${totalMockupsAdded}`, colors.dim);
  log(`  Total products: ${toProcess.length}`, colors.dim);

  if (errors.length > 0) {
    log("\n[5/5] Errors encountered:", colors.yellow);
    errors.forEach(({ product, error }) => {
      log(`  • ${product}: ${error}`, colors.red);
    });
  } else {
    log("\n✓ No errors!", colors.green);
  }

  console.log();
  if (!dryRun && successCount > 0) {
    log("🎉 Mockup images have been added to Shopify products!", colors.green);
    log("   Visit your storefront to see them in product galleries", colors.dim);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("\nFatal error:", error);
    process.exit(1);
  });
