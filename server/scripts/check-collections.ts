import "dotenv/config";

const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || "";
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";
const apiVersion = "2025-01";

async function checkCollections() {
  const handles = ["finish-paper", "finish-canvas", "finish-framed", "finish-metal"];
  
  console.log("Checking finish collections...\n");
  
  for (const handle of handles) {
    const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/smart_collections.json?handle=${handle}`;
    const response = await fetch(url, {
      headers: { "X-Shopify-Access-Token": shopifyAccessToken },
    });
    
    const data = await response.json();
    const exists = data.smart_collections && data.smart_collections.length > 0;
    
    if (exists) {
      const collection = data.smart_collections[0];
      console.log(`✅ ${handle}`);
      console.log(`   ID: ${collection.id}`);
      console.log(`   Title: ${collection.title}`);
      console.log(`   URL: /collections/${handle}`);
    } else {
      console.log(`❌ ${handle} - DOES NOT EXIST`);
    }
    console.log("");
  }
}

checkCollections().catch(console.error);
