#!/usr/bin/env tsx
import { config } from "dotenv";
import { isPrintifyConfigured, getShops } from "../lib/printify";

config();

console.log("Verifying Printify configuration...\n");

console.log("Environment variables:");
console.log(`  PRINTIFY_API_TOKEN: ${process.env.PRINTIFY_API_TOKEN ? '✓ Set' : '✗ Missing'}`);
console.log(`  PRINTIFY_SHOP_ID: ${process.env.PRINTIFY_SHOP_ID ? '✓ Set' : '(optional - will be fetched)'}`);
console.log();

console.log(`isPrintifyConfigured(): ${isPrintifyConfigured()}`);
console.log();

if (isPrintifyConfigured()) {
  console.log("Fetching shops from Printify API...");
  getShops().then(shops => {
    console.log(`✓ Found ${shops.length} shop(s):`);
    shops.forEach((shop: any) => {
      console.log(`  - ${shop.title} (ID: ${shop.id})`);
    });
    process.exit(0);
  }).catch(error => {
    console.error("✗ Failed to fetch shops:", error.message);
    process.exit(1);
  });
} else {
  console.error("✗ Printify is not configured");
  process.exit(1);
}
