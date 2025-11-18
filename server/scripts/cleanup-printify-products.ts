#!/usr/bin/env tsx
/**
 * Cleanup All Printify Products
 * Deletes all products from the Printify shop
 * Run with: cd server && npx tsx scripts/cleanup-printify-products.ts
 */

import { config } from "dotenv";
import { getProducts, deleteProduct } from "../lib/printify";
import * as readline from "readline/promises";

config();

const SHOP_ID = "25164625";

interface CleanupStats {
  total: number;
  deleted: number;
  failed: number;
}

const stats: CleanupStats = {
  total: 0,
  deleted: 0,
  failed: 0,
};

// Retry helper with exponential backoff
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      if (attempt === maxRetries) throw error;
      const delay = attempt * 1000; // 1s, 2s, 3s
      console.log(`  Retry ${attempt}/${maxRetries} after ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error("Max retries exceeded");
}

async function deletePrintifyProduct(productId: string): Promise<boolean> {
  try {
    await retryWithBackoff(() => deleteProduct(SHOP_ID, productId));
    stats.deleted++;
    return true;
  } catch (error: any) {
    console.error(`\n  ❌ Failed to delete ${productId}:`, error.message);
    stats.failed++;
    return false;
  }
}

async function getAllProducts(): Promise<any[]> {
  const allProducts: any[] = [];
  let page = 1;
  let hasMore = true;

  console.log("📋 Fetching all Printify products...");
  
  while (hasMore) {
    try {
      const result = await getProducts(SHOP_ID, page);
      const products = result.data || [];
      
      if (products.length === 0) {
        hasMore = false;
      } else {
        allProducts.push(...products);
        console.log(`  Page ${page}: Found ${products.length} products`);
        page++;
      }
    } catch (error: any) {
      console.error(`  Error fetching page ${page}:`, error.message);
      hasMore = false;
    }
  }
  
  return allProducts;
}

async function main() {
  console.log("🧹 PRINTIFY PRODUCT CLEANUP");
  console.log("═══════════════════════════════════════\n");
  
  // Get all products
  const products = await getAllProducts();
  stats.total = products.length;
  
  console.log(`\n  Found ${stats.total} total products\n`);
  
  if (stats.total === 0) {
    console.log("✅ No products to delete!\n");
    process.exit(0);
  }
  
  // Confirm deletion
  console.log(`⚠️  WARNING: This will DELETE ${stats.total} products from Printify.`);
  console.log("This action cannot be undone.\n");
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  const answer = await rl.question("Type 'YES' to proceed: ");
  rl.close();
  
  if (answer !== "YES") {
    console.log("\n❌ Cleanup cancelled\n");
    process.exit(0);
  }
  
  console.log("\n🚀 Starting deletion...\n");
  
  // Delete products
  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    process.stdout.write(`  [${i + 1}/${products.length}] Deleting ${product.id} (${product.title})...`);
    const success = await deletePrintifyProduct(product.id);
    console.log(success ? " ✅" : " ❌");
  }
  
  // Summary
  console.log("\n════════════════════════════════════════════════════════════");
  console.log("📊 CLEANUP SUMMARY");
  console.log("════════════════════════════════════════════════════════════\n");
  console.log(`Total products:   ${stats.total}`);
  console.log(`Deleted:          ${stats.deleted} ✅`);
  console.log(`Failed:           ${stats.failed} ${stats.failed > 0 ? '❌' : ''}`);
  console.log("\n════════════════════════════════════════════════════════════\n");
  
  if (stats.deleted === stats.total) {
    console.log("✅ All Printify products deleted!\n");
  } else {
    console.log(`⚠️  ${stats.failed} products failed to delete\n`);
  }
}

main().catch(error => {
  console.error("\n❌ Cleanup failed:", error.message);
  process.exit(1);
});
