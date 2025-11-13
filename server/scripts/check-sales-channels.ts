import "dotenv/config";

const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || "";
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";
const apiVersion = "2025-01";

async function checkSalesChannels() {
  // Get product IDs first
  const productsUrl = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products.json?handle=ancient-forest-canopy&fields=id,title`;
  const productsRes = await fetch(productsUrl, {
    headers: { "X-Shopify-Access-Token": shopifyAccessToken },
  });
  const productsData = await productsRes.json();
  const productId = productsData.products?.[0]?.id;
  
  if (!productId) {
    console.log("Product not found");
    return;
  }
  
  console.log(`Checking sales channels for product ID: ${productId}\n`);
  
  // Check which publications the product is in
  const pubUrl = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products/${productId}/product_publications.json`;
  const pubRes = await fetch(pubUrl, {
    headers: { "X-Shopify-Access-Token": shopifyAccessToken },
  });
  const pubData = await pubRes.json();
  
  console.log("Product Publications:");
  console.log(JSON.stringify(pubData, null, 2));
}

checkSalesChannels().catch(console.error);
