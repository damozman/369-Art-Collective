import "dotenv/config";

const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || "";
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";
const apiVersion = "2025-01";

async function fixProductTemplates() {
  console.log("Fetching all products...\n");
  
  const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products.json?limit=250`;
  const response = await fetch(url, {
    headers: { "X-Shopify-Access-Token": shopifyAccessToken },
  });
  
  const data = await response.json();
  const products = data.products || [];
  
  // Filter products that need fixing (no template_suffix or published_scope is not 'web')
  const needsFixing = products.filter(p => 
    !p.template_suffix || p.published_scope !== 'web'
  );
  
  console.log(`Found ${needsFixing.length} products that need template/scope fixes\n`);
  
  for (const product of needsFixing) {
    console.log(`Fixing: ${product.title} (${product.handle})...`);
    console.log(`  Current template: ${product.template_suffix || "NONE"}`);
    console.log(`  Current scope: ${product.published_scope}`);
    
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
          template_suffix: "art",
          published_scope: "web"
        }
      }),
    });
    
    if (updateResponse.ok) {
      console.log(`✅ Fixed: ${product.handle}`);
    } else {
      const error = await updateResponse.text();
      console.log(`❌ Failed: ${product.handle} - ${error}`);
    }
    console.log("");
  }
  
  console.log(`✅ Done! Fixed ${needsFixing.length} products`);
}

fixProductTemplates().catch(console.error);
