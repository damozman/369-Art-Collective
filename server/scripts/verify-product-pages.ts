import "dotenv/config";

const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || "";
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";
const apiVersion = "2025-01";

async function verifyProductPages() {
  const handles = ["abandoned-factory-1", "ancient-forest-canopy", "art-deco-facade"];
  
  console.log("Verifying product pages...\n");
  
  for (const handle of handles) {
    const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products.json?handle=${handle}&fields=id,title,handle,status,published_at,online_store_url`;
    const response = await fetch(url, {
      headers: { "X-Shopify-Access-Token": shopifyAccessToken },
    });
    
    const data = await response.json();
    if (data.products && data.products.length > 0) {
      const product = data.products[0];
      console.log(`${product.status === "active" && product.published_at ? "✅" : "❌"} ${handle}`);
      console.log(`   Status: ${product.status}`);
      console.log(`   Published: ${product.published_at || "NOT PUBLISHED"}`);
      console.log(`   Online Store URL: ${product.online_store_url || "NONE"}`);
      
      // Test the actual URL
      const testUrl = `https://369artcollective.com/products/${handle}`;
      const testResponse = await fetch(testUrl);
      console.log(`   HTTP Test: ${testResponse.status}`);
    } else {
      console.log(`❌ ${handle} - PRODUCT NOT FOUND IN SHOPIFY`);
    }
    console.log("");
  }
}

verifyProductPages().catch(console.error);
