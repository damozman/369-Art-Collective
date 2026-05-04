import "dotenv/config";

const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || "";
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";
const apiVersion = "2025-01";

async function compareProducts() {
  const handles = ["abandoned-factory-1", "ancient-forest-canopy"];
  
  console.log("Comparing working vs broken products...\n");
  
  for (const handle of handles) {
    console.log(`\n=== ${handle} ===`);
    const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products.json?handle=${handle}`;
    const response = await fetch(url, {
      headers: { "X-Shopify-Access-Token": shopifyAccessToken },
    });
    
    const data = await response.json();
    const product = data.products?.[0];
    
    if (product) {
      console.log(`Status: ${product.status}`);
      console.log(`Published At: ${product.published_at}`);
      console.log(`Published Scope: ${product.published_scope}`);
      console.log(`Template Suffix: ${product.template_suffix || "NONE"}`);
      
      // Test actual URL
      const testUrl = `https://369artcollective.com/products/${handle}`;
      const testResponse = await fetch(testUrl);
      console.log(`HTTP Test: ${testResponse.status}`);
    }
  }
}

compareProducts().catch(console.error);
