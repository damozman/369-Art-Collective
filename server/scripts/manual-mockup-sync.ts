#!/usr/bin/env tsx
/**
 * Manually trigger mockup sync for a specific product
 * Useful for testing or re-syncing products where initial sync may have failed
 */

import { config } from "dotenv";
import { syncPrintifyMockupsWithRetry } from "../lib/printify-mockup-sync";
import { getShops } from "../lib/printify";

config();

const printifyProductId = process.argv[2];
const shopifyProductId = process.argv[3];

if (!printifyProductId || !shopifyProductId) {
  console.error("Usage: tsx manual-mockup-sync.ts <printify-product-id> <shopify-product-id>");
  process.exit(1);
}

console.log("Fetching Printify shop ID...");
getShops().then(shops => {
  const printifyShopId = shops[0].id;
  console.log(`✓ Shop ID: ${printifyShopId}\n`);
  
  console.log("Manually triggering mockup sync...");
  console.log(`  Printify Product: ${printifyProductId}`);
  console.log(`  Shopify Product: ${shopifyProductId}`);
  console.log();

  return syncPrintifyMockupsWithRetry(
    printifyShopId,
    printifyProductId,
    shopifyProductId
  );
}).then(result => {
  console.log();
  console.log("Result:", result);
  
  if (result.success) {
    console.log(`✓ Success! Added ${result.mockupsAdded} mockup images to Shopify product`);
  } else {
    console.log(`✗ Failed: ${result.errors.join(", ")}`);
  }
  
  process.exit(result.success ? 0 : 1);
}).catch(error => {
  console.error("Fatal error:", error.message);
  process.exit(1);
});
