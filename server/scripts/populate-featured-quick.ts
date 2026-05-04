import "dotenv/config";

const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || "";
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";
const apiVersion = "2025-01";

async function getCollectionId(handle: string): Promise<string | null> {
  const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/custom_collections.json?limit=250`;
  const response = await fetch(url, {
    headers: { "X-Shopify-Access-Token": shopifyAccessToken },
  });

  if (!response.ok) return null;

  const data = await response.json();
  const collection = data.custom_collections?.find((c: any) => c.handle === handle);
  return collection?.id?.toString() || null;
}

async function createFeaturedCollection(): Promise<string | null> {
  console.log("\n📝 Creating Featured collection...");
  
  const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/custom_collections.json`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": shopifyAccessToken,
    },
    body: JSON.stringify({
      custom_collection: {
        title: "Featured",
        handle: "featured",
        body_html: "<p>Handpicked featured artwork from our most talented artists.</p>",
        published: true,
        sort_order: "best-selling",
      },
    }),
  });

  if (response.ok) {
    const data = await response.json();
    const id = data.custom_collection.id?.toString();
    console.log(`   ✓ Created Featured collection (ID: ${id})`);
    return id;
  } else if (response.status === 422) {
    console.log(`   ℹ️  Featured collection already exists, fetching ID...`);
    const existingId = await getCollectionId("featured");
    if (existingId) {
      console.log(`   ✓ Found existing Featured collection (ID: ${existingId})`);
    }
    return existingId;
  } else {
    const error = await response.text();
    console.error(`   ❌ Failed:`, error);
    return null;
  }
}

async function getWallArtProducts(limit: number = 5): Promise<any[]> {
  const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products.json?limit=${limit}&status=active`;
  const response = await fetch(url, {
    headers: { "X-Shopify-Access-Token": shopifyAccessToken },
  });

  if (!response.ok) return [];

  const data = await response.json();
  return data.products || [];
}

async function addProductToCollection(collectionId: string, productId: string): Promise<boolean> {
  const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/collects.json`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": shopifyAccessToken,
    },
    body: JSON.stringify({
      collect: {
        product_id: productId,
        collection_id: collectionId,
      },
    }),
  });

  return response.ok || response.status === 422; // 422 = already exists
}

async function main() {
  console.log("\n🎯 Quick Featured Collection Population\n");
  console.log("=".repeat(60));

  if (!shopifyShopUrl || !shopifyAccessToken) {
    console.error("\n❌ Shopify credentials not configured");
    process.exit(1);
  }

  // Step 1: Create or get Featured collection
  const collectionId = await createFeaturedCollection();
  
  if (!collectionId) {
    console.error("\n❌ Could not create or find Featured collection");
    process.exit(1);
  }

  // Step 2: Get first 5 wall art products
  console.log("\n📦 Fetching wall art products...");
  const products = await getWallArtProducts(5);
  console.log(`   ✓ Found ${products.length} products\n`);

  if (products.length === 0) {
    console.log("   ⚠️  No products found. Upload artworks to Shopify first.");
    process.exit(0);
  }

  // Step 3: Add all products to Featured collection
  console.log("📥 Adding products to Featured collection:\n");
  
  for (const product of products) {
    const productId = product.id?.toString();
    const title = product.title || "Unknown";
    
    if (!productId) continue;
    
    const success = await addProductToCollection(collectionId, productId);
    
    if (success) {
      console.log(`   ✓ ${title}`);
    } else {
      console.log(`   ❌ Failed: ${title}`);
    }
    
    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ Featured collection populated!\n");
  console.log("🌐 View at: https://369artcollective.com/collections/featured");
  console.log("🏠 Hero slider will now activate on homepage\n");
}

main().catch(console.error);
