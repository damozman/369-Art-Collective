import { deleteAllProducts } from "./lib/shopify";

async function clearShopify() {
  try {
    console.log("Starting Shopify product cleanup...");
    const result = await deleteAllProducts();
    console.log(`✅ Successfully deleted ${result.deleted} products`);
    if (result.errors.length > 0) {
      console.log(`⚠️  Errors encountered: ${result.errors.length}`);
      result.errors.forEach((err: string) => console.log(`  - ${err}`));
    }
  } catch (error: any) {
    console.error("❌ Error clearing Shopify:", error.message);
  }
  process.exit(0);
}

clearShopify();
