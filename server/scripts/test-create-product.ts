#!/usr/bin/env tsx
import { config } from "dotenv";
import { createWallArtProducts } from "../lib/printify-service";
import { getProduct } from "../lib/printify";

config();

const shopId = "25164625";
const testImageUrl = "https://images.unsplash.com/photo-1511818966892-d7d671e672a2?w=800&h=1000&fit=crop";
const testTitle = "TEST - Abandoned Factory (Unsplash)";

console.log("Creating test Printify product...");
console.log(`  Image: ${testImageUrl}`);
console.log(`  Title: ${testTitle}`);
console.log();

createWallArtProducts(testImageUrl, testTitle, "Test product").then(result => {
  console.log("✓ Product created successfully!");
  console.log(`  Product ID: ${result.printifyProductId}`);
  console.log(`  Image ID: ${result.printifyImageId}`);
  console.log();
  
  // Wait 2 seconds then verify it exists
  console.log("Waiting 2 seconds...");
  return new Promise(resolve => setTimeout(() => resolve(result), 2000));
}).then((result: any) => {
  console.log("Verifying product exists in Printify...");
  return getProduct(shopId, result.printifyProductId);
}).then(product => {
  console.log("✓ Product verified! Title:", product.title);
  console.log("  Images:", product.images?.length || 0);
  process.exit(0);
}).catch(error => {
  console.error("✗ Error:", error.message);
  process.exit(1);
});
