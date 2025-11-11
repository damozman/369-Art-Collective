import "dotenv/config";

const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || "";
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";
const apiVersion = "2025-01";

async function checkSmartCollections() {
  console.log("\n🤖 Checking Smart Collections\n");
  console.log("=".repeat(60));

  const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/smart_collections.json?limit=250`;
  const response = await fetch(url, {
    headers: { "X-Shopify-Access-Token": shopifyAccessToken },
  });

  if (!response.ok) {
    console.log("❌ Failed to fetch smart collections");
    return;
  }

  const data = await response.json();
  const collections = data.smart_collections || [];

  console.log(`Found ${collections.length} smart collections:\n`);

  for (const collection of collections) {
    console.log(`📁 ${collection.title}`);
    console.log(`   Handle: ${collection.handle}`);
    console.log(`   ID: ${collection.id}`);
    console.log(`   Rules: ${JSON.stringify(collection.rules, null, 2)}`);
    
    // Get product count
    const countUrl = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products/count.json?collection_id=${collection.id}`;
    const countResponse = await fetch(countUrl, {
      headers: { "X-Shopify-Access-Token": shopifyAccessToken },
    });

    if (countResponse.ok) {
      const countData = await countResponse.json();
      console.log(`   Product Count: ${countData.count}`);
    }
    console.log();
  }

  console.log("=".repeat(60) + "\n");
}

checkSmartCollections()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
