import "dotenv/config";

const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || "";
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";
const apiVersion = "2025-01";

async function activateAllProducts() {
  console.log("Fetching all products...\n");
  
  const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products.json?limit=250&fields=id,title,handle,status`;
  const response = await fetch(url, {
    headers: { "X-Shopify-Access-Token": shopifyAccessToken },
  });
  
  const data = await response.json();
  const products = data.products || [];
  
  const draftProducts = products.filter(p => p.status === "draft");
  
  console.log(`Found ${draftProducts.length} draft products to activate\n`);
  
  for (const product of draftProducts) {
    console.log(`Activating: ${product.title} (${product.handle})...`);
    
    const updateUrl = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products/${product.id}.json`;
    const updateResponse = await fetch(updateUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": shopifyAccessToken,
      },
      body: JSON.stringify({
        product: {
          id: product.id,
          status: "active"
        }
      }),
    });
    
    if (updateResponse.ok) {
      console.log(`✅ Activated: ${product.handle}`);
    } else {
      const error = await updateResponse.text();
      console.log(`❌ Failed: ${product.handle} - ${error}`);
    }
  }
  
  console.log(`\n✅ Done! Activated ${draftProducts.length} products`);
}

activateAllProducts().catch(console.error);
