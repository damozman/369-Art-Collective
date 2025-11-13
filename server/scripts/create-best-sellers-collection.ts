import "dotenv/config";

const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || "";
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";
const apiVersion = "2025-01";

async function createBestSellersSmartCollection() {
  console.log("\n🎯 Creating Best Sellers Smart Collection\n");
  console.log("=".repeat(60));

  if (!shopifyShopUrl || !shopifyAccessToken) {
    console.error("\n❌ Shopify credentials not configured");
    process.exit(1);
  }

  const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/smart_collections.json`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": shopifyAccessToken,
    },
    body: JSON.stringify({
      smart_collection: {
        title: "Best Sellers",
        handle: "best-sellers",
        body_html: "<p>Our most popular artwork, loved by collectors worldwide. These top-selling pieces showcase the talent and creativity of our featured artists.</p>",
        published: true,
        sort_order: "best-selling", // Shopify automatically sorts by sales volume
        rules: [
          {
            column: "variant_inventory",
            relation: "greater_than",
            condition: "-1" // Include all products (inventory > -1)
          }
        ],
        disjunctive: false // Use AND logic (though we only have 1 rule)
      },
    }),
  });

  if (response.ok) {
    const data = await response.json();
    const collection = data.smart_collection;
    console.log("\n✅ Best Sellers Smart Collection created successfully!\n");
    console.log(`📋 Collection Details:`);
    console.log(`   ID: ${collection.id}`);
    console.log(`   Title: ${collection.title}`);
    console.log(`   Handle: ${collection.handle}`);
    console.log(`   Sort Order: ${collection.sort_order}`);
    console.log(`   URL: https://${shopifyShopUrl}/collections/${collection.handle}`);
    console.log(`\n✨ This collection will automatically show your best-selling products`);
    console.log(`   sorted by sales volume (Shopify tracks this automatically)`);
    
  } else if (response.status === 422) {
    console.log("\n⚠️  Best Sellers collection already exists");
    
    // Try to fetch the existing one
    const getUrl = `https://${shopifyShopUrl}/admin/api/${apiVersion}/smart_collections.json?handle=best-sellers`;
    const getRes = await fetch(getUrl, {
      headers: { "X-Shopify-Access-Token": shopifyAccessToken },
    });
    
    if (getRes.ok) {
      const getData = await getRes.json();
      const existing = getData.smart_collections?.[0];
      if (existing) {
        console.log(`\n📋 Existing Collection:`);
        console.log(`   ID: ${existing.id}`);
        console.log(`   Title: ${existing.title}`);
        console.log(`   Sort Order: ${existing.sort_order}`);
        console.log(`   URL: https://${shopifyShopUrl}/collections/${existing.handle}`);
      }
    }
    
  } else {
    const error = await response.text();
    console.error(`\n❌ Failed to create collection:`, error);
    process.exit(1);
  }

  console.log("\n" + "=".repeat(60));
}

createBestSellersSmartCollection().catch(console.error);
