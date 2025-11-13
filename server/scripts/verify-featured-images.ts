import "dotenv/config";

const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || "";
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";
const apiVersion = "2025-01";

async function verifyFeaturedImages() {
  const collUrl = `https://${shopifyShopUrl}/admin/api/${apiVersion}/custom_collections.json?handle=featured`;
  const collRes = await fetch(collUrl, {
    headers: { "X-Shopify-Access-Token": shopifyAccessToken },
  });
  
  const collData = await collRes.json();
  const collectionId = collData.custom_collections?.[0]?.id;
  
  if (!collectionId) {
    console.log("Featured collection not found");
    return;
  }
  
  const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products.json?collection_id=${collectionId}&limit=10`;
  const response = await fetch(url, {
    headers: { "X-Shopify-Access-Token": shopifyAccessToken },
  });
  
  const data = await response.json();
  const products = data.products || [];
  
  console.log("\n=== FEATURED COLLECTION PRODUCTS ===\n");
  
  for (const product of products) {
    const hasImage = product.image?.src ? "✅" : "❌";
    console.log(`${hasImage} Handle: "${product.handle}"`);
    console.log(`   Title: ${product.title}`);
    console.log(`   Image: ${product.image?.src || "NO IMAGE"}`);
    console.log("");
  }
  
  const handles = products.map(p => p.handle).join(",");
  console.log("=== COPY THIS LIST ===");
  console.log(handles);
}

verifyFeaturedImages().catch(console.error);
