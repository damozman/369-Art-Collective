import "dotenv/config";

const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || "";
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";
const apiVersion = "2025-01";

async function getCollectionId(handle: string): Promise<any> {
  const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/custom_collections.json?limit=250`;
  const response = await fetch(url, {
    headers: { "X-Shopify-Access-Token": shopifyAccessToken },
  });

  if (!response.ok) return null;

  const data = await response.json();
  const collection = data.custom_collections?.find((c: any) => c.handle === handle);
  return collection || null;
}

async function publishCollection(collectionId: string): Promise<boolean> {
  const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/custom_collections/${collectionId}.json`;
  
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": shopifyAccessToken,
    },
    body: JSON.stringify({
      custom_collection: {
        id: collectionId,
        published: true,
        published_scope: "web",
      },
    }),
  });

  return response.ok;
}

async function main() {
  console.log("\n🌐 Publishing Featured Collection\n");
  console.log("=".repeat(60));

  if (!shopifyShopUrl || !shopifyAccessToken) {
    console.error("\n❌ Shopify credentials not configured");
    process.exit(1);
  }

  // Get Featured collection
  console.log("\n📋 Finding Featured collection...");
  const collection = await getCollectionId("featured");
  
  if (!collection) {
    console.error("   ❌ Featured collection not found");
    process.exit(1);
  }

  const collectionId = collection.id.toString();
  console.log(`   ✓ Found: ${collection.title} (ID: ${collectionId})`);
  console.log(`   Current status: ${collection.published ? '✅ Published' : '❌ Not published'}`);

  // Publish the collection
  if (!collection.published) {
    console.log("\n📤 Publishing collection to storefront...");
    const success = await publishCollection(collectionId);
    
    if (success) {
      console.log("   ✓ Collection published successfully!");
    } else {
      console.error("   ❌ Failed to publish collection");
      process.exit(1);
    }
  } else {
    console.log("\n✅ Collection is already published!");
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ Done!\n");
  console.log("🌐 View at: https://369artcollective.com/collections/featured");
  console.log("🏠 Hero slider should now activate on homepage\n");
  console.log("💡 Hard refresh homepage (Ctrl+Shift+R or Cmd+Shift+R) to see changes\n");
}

main().catch(console.error);
