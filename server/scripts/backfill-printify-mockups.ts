#!/usr/bin/env tsx
/**
 * Backfill Printify Mockups Script
 * 
 * Syncs Printify-generated mockup images to Shopify for all existing approved artworks.
 * Run this once to populate product galleries for existing products.
 * 
 * Usage: npm run backfill-mockups
 */

import { storage } from "../storage";
import { syncPrintifyMockupsWithRetry } from "../lib/printify-mockup-sync";
import { getShops } from "../lib/printify";
import { isPrintifyConfigured } from "../lib/printify";
import { isShopifyConfigured } from "../lib/shopify";

// ANSI color codes for pretty console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

interface ProcessingResult {
  artworkId: string;
  artworkTitle: string;
  success: boolean;
  mockupsAdded: number;
  error?: string;
}

async function backfillPrintifyMockups() {
  console.log(`${colors.bright}${colors.blue}
╔════════════════════════════════════════════════════════════════╗
║        Printify Mockup Backfill Script                         ║
║        Syncing mockup images to Shopify product galleries      ║
╚════════════════════════════════════════════════════════════════╝
${colors.reset}\n`);

  // Step 1: Validate configuration
  console.log(`${colors.cyan}[1/5] Validating API configuration...${colors.reset}`);
  
  if (!isPrintifyConfigured()) {
    console.error(`${colors.red}✗ Printify API is not configured. Please set PRINTIFY_API_TOKEN.${colors.reset}`);
    process.exit(1);
  }
  
  if (!isShopifyConfigured()) {
    console.error(`${colors.red}✗ Shopify API is not configured. Please set SHOPIFY_SHOP and SHOPIFY_ACCESS_TOKEN.${colors.reset}`);
    process.exit(1);
  }
  
  console.log(`${colors.green}✓ API configuration valid${colors.reset}\n`);

  // Step 2: Get Printify shop ID
  console.log(`${colors.cyan}[2/5] Retrieving Printify shop information...${colors.reset}`);
  
  let printifyShopId: string;
  try {
    const shops = await getShops();
    if (!shops || shops.length === 0) {
      console.error(`${colors.red}✗ No Printify shops found${colors.reset}`);
      process.exit(1);
    }
    printifyShopId = shops[0].id;
    console.log(`${colors.green}✓ Using Printify shop: ${printifyShopId}${colors.reset}\n`);
  } catch (error: any) {
    console.error(`${colors.red}✗ Failed to retrieve Printify shops: ${error.message}${colors.reset}`);
    process.exit(1);
  }

  // Step 3: Query database for approved artworks with product IDs
  console.log(`${colors.cyan}[3/5] Querying database for eligible artworks...${colors.reset}`);
  
  const allArtworks = await storage.getArtworks();
  const eligibleArtworks = allArtworks.filter(
    artwork => 
      artwork.status === 'approved' && 
      artwork.printifyProductId && 
      artwork.shopifyProductId
  );
  
  console.log(`${colors.gray}  Total artworks: ${allArtworks.length}${colors.reset}`);
  console.log(`${colors.green}✓ Found ${eligibleArtworks.length} eligible artworks to process${colors.reset}\n`);
  
  if (eligibleArtworks.length === 0) {
    console.log(`${colors.yellow}No artworks to process. Exiting.${colors.reset}`);
    process.exit(0);
  }

  // Step 4: Process each artwork
  console.log(`${colors.cyan}[4/5] Processing artworks...${colors.reset}\n`);
  
  const results: ProcessingResult[] = [];
  let successCount = 0;
  let failureCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < eligibleArtworks.length; i++) {
    const artwork = eligibleArtworks[i];
    const progress = `[${i + 1}/${eligibleArtworks.length}]`;
    
    console.log(`${colors.gray}${progress} Processing: ${colors.reset}${artwork.title}`);
    console.log(`${colors.gray}  Artwork ID: ${artwork.id}${colors.reset}`);
    console.log(`${colors.gray}  Printify: ${artwork.printifyProductId}${colors.reset}`);
    console.log(`${colors.gray}  Shopify: ${artwork.shopifyProductId}${colors.reset}`);

    try {
      const result = await syncPrintifyMockupsWithRetry(
        printifyShopId,
        artwork.printifyProductId!,
        artwork.shopifyProductId!,
        3 // Max 3 retry attempts
      );

      if (result.success && result.mockupsAdded > 0) {
        console.log(`${colors.green}  ✓ Success: Added ${result.mockupsAdded} mockup images${colors.reset}\n`);
        results.push({
          artworkId: artwork.id,
          artworkTitle: artwork.title,
          success: true,
          mockupsAdded: result.mockupsAdded,
        });
        successCount++;
      } else if (result.success && result.mockupsAdded === 0) {
        console.log(`${colors.yellow}  ⊘ Skipped: No new mockups to add (may already be synced)${colors.reset}\n`);
        results.push({
          artworkId: artwork.id,
          artworkTitle: artwork.title,
          success: true,
          mockupsAdded: 0,
        });
        skippedCount++;
      } else {
        console.log(`${colors.red}  ✗ Failed: ${result.errors.join(', ')}${colors.reset}\n`);
        results.push({
          artworkId: artwork.id,
          artworkTitle: artwork.title,
          success: false,
          mockupsAdded: 0,
          error: result.errors.join(', '),
        });
        failureCount++;
      }
    } catch (error: any) {
      console.log(`${colors.red}  ✗ Error: ${error.message}${colors.reset}\n`);
      results.push({
        artworkId: artwork.id,
        artworkTitle: artwork.title,
        success: false,
        mockupsAdded: 0,
        error: error.message,
      });
      failureCount++;
    }

    // Small delay between requests to avoid rate limiting
    if (i < eligibleArtworks.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Step 5: Display summary
  console.log(`${colors.cyan}[5/5] Summary${colors.reset}`);
  console.log(`${colors.bright}
╔════════════════════════════════════════════════════════════════╗
║                    BACKFILL COMPLETE                           ║
╚════════════════════════════════════════════════════════════════╝
${colors.reset}`);
  
  console.log(`${colors.gray}Total processed:${colors.reset} ${eligibleArtworks.length}`);
  console.log(`${colors.green}✓ Successful:${colors.reset}    ${successCount}`);
  console.log(`${colors.yellow}⊘ Skipped:${colors.reset}       ${skippedCount} (no new mockups)`);
  console.log(`${colors.red}✗ Failed:${colors.reset}        ${failureCount}\n`);

  if (failureCount > 0) {
    console.log(`${colors.red}Failed artworks:${colors.reset}`);
    results
      .filter(r => !r.success)
      .forEach(r => {
        console.log(`  ${colors.red}✗${colors.reset} ${r.artworkTitle} (${r.artworkId}): ${r.error}`);
      });
    console.log('');
  }

  const totalMockupsAdded = results.reduce((sum, r) => sum + r.mockupsAdded, 0);
  console.log(`${colors.bright}${colors.green}Total mockup images added: ${totalMockupsAdded}${colors.reset}\n`);

  if (successCount > 0) {
    console.log(`${colors.green}✓ Your Shopify product galleries are now populated with mockup images!${colors.reset}`);
    console.log(`${colors.gray}  Visit your storefront to see the updated product pages.${colors.reset}\n`);
  }
}

// Run the script
backfillPrintifyMockups()
  .then(() => {
    console.log(`${colors.green}✓ Backfill complete${colors.reset}\n`);
    process.exit(0);
  })
  .catch((error) => {
    console.error(`${colors.red}✗ Fatal error: ${error.message}${colors.reset}`);
    console.error(error);
    process.exit(1);
  });
