import "dotenv/config";

const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || "";
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";
const apiVersion = "2025-01";

async function getFeaturedHandles() {
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
  
  console.log("\nProduct Handles for Featured Collection:\n");
  products.forEach(p => {
    console.log(`"${p.handle}",  // ${p.title}`);
  });
  
  console.log("\nCopy this comma-separated list:");
  console.log(products.map(p => p.handle).join(','));
}

getFeaturedHandles().catch(console.error);
