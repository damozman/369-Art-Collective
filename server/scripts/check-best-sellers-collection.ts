import "dotenv/config";

const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || "";
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";
const apiVersion = "2025-01";

async function checkBestSellersCollection() {
  console.log("\n🔍 Checking Best Sellers Collection\n");
  
  // Check Custom Collections first
  const customUrl = `https://${shopifyShopUrl}/admin/api/${apiVersion}/custom_collections.json?handle=best-sellers`;
  const customRes = await fetch(customUrl, {
    headers: { "X-Shopify-Access-Token": shopifyAccessToken },
  });
  
  const customData = await customRes.json();
  
  if (customData.custom_collections?.length > 0) {
    const collection = customData.custom_collections[0];
    console.log("✓ Found as CUSTOM Collection (manually curated)");
    console.log(`  ID: ${collection.id}`);
    console.log(`  Title: ${collection.title}`);
    console.log(`  Handle: ${collection.handle}`);
    console.log(`  Sort Order: ${collection.sort_order}`);
    console.log("\n⚠️  This is a MANUAL collection - you need to add products manually");
    return;
  }
  
  // Check Smart Collections
  const smartUrl = `https://${shopifyShopUrl}/admin/api/${apiVersion}/smart_collections.json?handle=best-sellers`;
  const smartRes = await fetch(smartUrl, {
    headers: { "X-Shopify-Access-Token": shopifyAccessToken },
  });
  
  const smartData = await smartRes.json();
  
  if (smartData.smart_collections?.length > 0) {
    const collection = smartData.smart_collections[0];
    console.log("✓ Found as SMART Collection (automatic)");
    console.log(`  ID: ${collection.id}`);
    console.log(`  Title: ${collection.title}`);
    console.log(`  Handle: ${collection.handle}`);
    console.log(`  Sort Order: ${collection.sort_order}`);
    console.log("\n📋 Automatic Rules:");
    collection.rules?.forEach((rule: any, i: number) => {
      console.log(`  ${i + 1}. ${rule.column} ${rule.relation} "${rule.condition}"`);
    });
    console.log("\n✅ This collection auto-populates based on rules");
    return;
  }
  
  console.log("❌ Best Sellers collection not found");
  console.log("\n💡 You can create it as a Smart Collection with these rules:");
  console.log("   - Sort by: Total Sales (descending)");
  console.log("   - Or use Shopify's built-in 'Best Selling' sort order");
}

checkBestSellersCollection().catch(console.error);
