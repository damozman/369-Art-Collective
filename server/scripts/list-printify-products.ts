#!/usr/bin/env tsx
import { config } from "dotenv";
import { getProducts } from "../lib/printify";

config();

const shopId = "25164625";

console.log("Fetching all products from Printify...\n");

getProducts(shopId).then(result => {
  const products = result.data || [];
  console.log(`Total products in shop: ${products.length}\n`);
  
  if (products.length > 0) {
    console.log("Products:");
    products.forEach((p: any, i: number) => {
      console.log(`${i + 1}. ${p.title}`);
      console.log(`   ID: ${p.id}`);
      console.log(`   Images: ${p.images?.length || 0}`);
      console.log();
    });
  }
  
  process.exit(0);
}).catch(error => {
  console.error("Error:", error.message);
  process.exit(1);
});
