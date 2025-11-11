import "dotenv/config";

const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || "";
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";
const apiVersion = "2025-01";

async function createFeaturedCollection() {
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
    console.log(`   ✓ Created Featured collection (ID: ${data.custom_collection.id})`);
    return data.custom_collection.id;
  } else if (response.status === 422) {
    console.log(`   ℹ️  Featured collection already exists`);
    return null;
  } else {
    const error = await response.text();
    console.error(`   ❌ Failed:`, error);
    return null;
  }
}

async function getCollectionId(handle: string): Promise<string | null> {
  const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/custom_collections.json?limit=250`;
  const response = await fetch(url, {
    headers: { "X-Shopify-Access-Token": shopifyAccessToken },
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const collection = data.custom_collections?.find((c: any) => c.handle === handle);
  return collection?.id || null;
}

async function getProductsWithFinish(finish: string): Promise<string[]> {
  const productIds: string[] = [];
  let url: string | null = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products.json?limit=250&status=active`;

  while (url) {
    const response: Response = await fetch(url, {
      headers: { "X-Shopify-Access-Token": shopifyAccessToken },
    });

    if (!response.ok) break;

    const data = await response.json();
    const products = data.products || [];

    for (const product of products) {
      const tags = (product.tags || "").toLowerCase();
      if (tags.includes(`finish:${finish.toLowerCase()}`)) {
        productIds.push(product.id);
      }
    }

    const linkHeader: string | null = response.headers.get("Link");
    url = linkHeader?.match(/<([^>]+)>;\s*rel="next"/)?.[1] || null;
  }

  return productIds;
}

async function addProductsToCollection(
  collectionId: string,
  productIds: string[]
): Promise<{ added: number; failed: number }> {
  let added = 0;
  let failed = 0;

  // Process in batches to avoid rate limits
  const batchSize = 5;
  for (let i = 0; i < productIds.length; i += batchSize) {
    const batch = productIds.slice(i, i + batchSize);
    
    const promises = batch.map(async (productId) => {
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

      return { success: response.ok || response.status === 422, productId };
    });

    const results = await Promise.all(promises);
    results.forEach(r => r.success ? added++ : failed++);

    // Rate limiting between batches
    await new Promise(resolve => setTimeout(resolve, 600));
  }

  return { added, failed };
}

async function main() {
  console.log("\n🎨 Fixing Collections\n");
  console.log("=".repeat(60));

  if (!shopifyShopUrl || !shopifyAccessToken) {
    console.log("❌ Shopify not configured");
    return;
  }

  // 1. Create Featured collection if it doesn't exist
  await createFeaturedCollection();

  // 2. Define collections to populate
  const collectionsToFix = [
    { handle: "canvas-prints", name: "Canvas Prints", finish: "canvas" },
    { handle: "posters", name: "Posters", finish: "paper" },
    { handle: "metal-prints", name: "Metal Prints", finish: "metal" },
    { handle: "framed-prints", name: "Framed Prints", finish: "framed" },
  ];

  console.log("\n" + "=".repeat(60));
  console.log("🔄 Populating Collections");
  console.log("=".repeat(60));

  for (const collection of collectionsToFix) {
    console.log(`\n📁 ${collection.name}...`);

    const collectionId = await getCollectionId(collection.handle);
    if (!collectionId) {
      console.log(`   ⚠️  Collection not found`);
      continue;
    }

    console.log(`   ✓ Found collection (ID: ${collectionId})`);
    console.log(`   🔍 Finding products with finish: ${collection.finish}...`);

    const productIds = await getProductsWithFinish(collection.finish);
    console.log(`   ✓ Found ${productIds.length} matching products`);

    if (productIds.length === 0) {
      console.log(`   ⚠️  No products to add`);
      continue;
    }

    console.log(`   📥 Adding products to collection...`);
    const { added, failed } = await addProductsToCollection(collectionId, productIds);
    console.log(`   ✓ Added ${added} products (${failed} failed/already exist)`);
  }

  // 3. Populate Featured with products that have "Featured" or "New" tag
  console.log(`\n📁 Featured...`);
  const featuredId = await getCollectionId("featured");
  if (featuredId) {
    console.log(`   ✓ Found collection (ID: ${featuredId})`);
    console.log(`   🔍 Finding featured/new products...`);
    
    const featuredProducts: string[] = [];
    let url: string | null = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products.json?limit=250&status=active`;

    while (url && featuredProducts.length < 20) {
      const response: Response = await fetch(url, {
        headers: { "X-Shopify-Access-Token": shopifyAccessToken },
      });

      if (!response.ok) break;

      const data = await response.json();
      const products = data.products || [];

      for (const product of products) {
        const tags = (product.tags || "").toLowerCase();
        if (tags.includes("featured") || tags.includes("new")) {
          featuredProducts.push(product.id);
          if (featuredProducts.length >= 20) break;
        }
      }

      const linkHeader: string | null = response.headers.get("Link");
      url = linkHeader?.match(/<([^>]+)>;\s*rel="next"/)?.[1] || null;
    }

    console.log(`   ✓ Found ${featuredProducts.length} products`);
    
    if (featuredProducts.length > 0) {
      console.log(`   📥 Adding products to collection...`);
      const { added, failed } = await addProductsToCollection(featuredId, featuredProducts);
      console.log(`   ✓ Added ${added} products (${failed} failed/already exist)`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ COMPLETE");
  console.log("=".repeat(60) + "\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
