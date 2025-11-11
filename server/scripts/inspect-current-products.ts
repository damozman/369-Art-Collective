import "dotenv/config";

const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || "";
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";
const apiVersion = "2025-01";

async function inspectProducts() {
  console.log("\n🔍 Inspecting Current Product Structure\n");
  console.log("=".repeat(60));

  const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products.json?limit=2&status=active`;
  const response = await fetch(url, {
    headers: { "X-Shopify-Access-Token": shopifyAccessToken },
  });

  if (!response.ok) {
    console.log("❌ Failed to fetch products");
    return;
  }

  const data = await response.json();
  const products = data.products || [];

  for (const product of products) {
    console.log(`\n📦 Product: ${product.title}`);
    console.log(`   ID: ${product.id}`);
    console.log(`   Tags: ${product.tags}`);
    console.log(`   Options: ${JSON.stringify(product.options, null, 2)}`);
    console.log(`\n   Variants (${product.variants.length}):`);
    
    product.variants.slice(0, 4).forEach((v: any, i: number) => {
      console.log(`\n   [${i + 1}] ${v.title}`);
      console.log(`      ID: ${v.id}`);
      console.log(`      SKU: ${v.sku}`);
      console.log(`      Price: $${v.price}`);
      console.log(`      Weight: ${v.weight} ${v.weight_unit}`);
      console.log(`      Option1: ${v.option1} (${product.options[0]?.name})`);
      console.log(`      Option2: ${v.option2} (${product.options[1]?.name})`);
      console.log(`      Inventory: ${v.inventory_quantity}`);
    });
    
    if (product.variants.length > 4) {
      console.log(`\n   ... and ${product.variants.length - 4} more variants`);
    }
  }

  console.log("\n" + "=".repeat(60) + "\n");
}

inspectProducts()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
