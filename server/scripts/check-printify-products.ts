#!/usr/bin/env tsx
import { config } from "dotenv";
import { getProducts, getProduct } from "../lib/printify";

config();

const shopId = process.env.PRINTIFY_SHOP_ID!;

console.log("Checking Printify shop...");
console.log(`Shop ID: ${shopId}`);
console.log();

// Check recent products
console.log("Fetching products from Printify...");
getProducts(shopId).then(result => {
  console.log(`Total products in shop: ${result.data?.length || 0}`);
  
  if (result.data && result.data.length > 0) {
    console.log("\nMost recent products:");
    result.data.slice(0, 5).forEach((p: any) => {
      console.log(`  - ${p.title} (ID: ${p.id})`);
    });
  }
  
  // Try to get the specific product that should exist
  const testProductId = "69166c3d30df88736d05f17a";
  console.log(`\nChecking for product ${testProductId}...`);
  
  return getProduct(shopId, testProductId);
}).then(product => {
  console.log("✓ Product found:", product.title);
}).catch(error => {
  console.log("✗ Product not found:", error.message);
}).finally(() => {
  process.exit(0);
});
