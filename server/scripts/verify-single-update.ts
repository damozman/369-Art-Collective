import "dotenv/config";

const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || "";
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";
const apiVersion = "2025-01";

// Check "Mirror Universe" which was supposedly updated first
const productId = "9875835257129";

async function verifyUpdate() {
  const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products/${productId}.json`;
  const response = await fetch(url, {
    headers: { "X-Shopify-Access-Token": shopifyAccessToken },
  });

  if (!response.ok) {
    console.log("Failed to fetch product");
    return;
  }

  const data = await response.json();
  const product = data.product;

  console.log("\n📦 Product: " + product.title);
  console.log("ID: " + product.id);
  console.log("Tags: " + product.tags);
  console.log("\nOptions:");
  console.log(JSON.stringify(product.options, null, 2));
  console.log("\nVariants: " + product.variants.length);
  
  const finishes = new Set(product.variants.map((v: any) => v.option2));
  console.log("Finishes found: " + Array.from(finishes).join(", "));
  
  if (product.variants.length === 16 && finishes.has("Framed") && finishes.has("Metal")) {
    console.log("\n✅ Product WAS successfully updated!");
  } else {
    console.log("\n❌ Product was NOT updated - still has old structure");
  }
}

verifyUpdate()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
