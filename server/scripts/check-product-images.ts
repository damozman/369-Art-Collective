import "dotenv/config";

const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || "";
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";
const apiVersion = "2025-01";

async function checkFeaturedProducts() {
  console.log("\n🔍 Checking Featured Collection Products\n");
  
  // Get collection ID
  const collUrl = `https://${shopifyShopUrl}/admin/api/${apiVersion}/custom_collections.json?handle=featured`;
  const collRes = await fetch(collUrl, {
    headers: { "X-Shopify-Access-Token": shopifyAccessToken },
  });
  
  const collData = await collRes.json();
  const collectionId = collData.custom_collections?.[0]?.id;
  
  if (!collectionId) {
    console.log("❌ Featured collection not found");
    return;
  }
  
  console.log(`✓ Featured collection ID: ${collectionId}\n`);
  
  // Get products in collection
  const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products.json?collection_id=${collectionId}&limit=10`;
  const response = await fetch(url, {
    headers: { "X-Shopify-Access-Token": shopifyAccessToken },
  });
  
  const data = await response.json();
  const products = data.products || [];
  
  console.log(`Found ${products.length} products in Featured collection:\n`);
  
  for (const product of products) {
    console.log(`📦 ${product.title} (ID: ${product.id})`);
    console.log(`   Vendor: ${product.vendor || 'N/A'}`);
    console.log(`   Featured Image: ${product.image?.src ? '✓ YES' : '❌ NO'}`);
    console.log(`   Total Images: ${product.images?.length || 0}`);
    
    if (product.images && product.images.length > 0) {
      console.log(`   First image: ${product.images[0].src}`);
    }
    console.log();
  }
}

checkFeaturedProducts().catch(console.error);
