import "dotenv/config";

const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || "";
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";
const apiVersion = "2025-01";

interface Collection {
  id: string;
  title: string;
  handle: string;
}

interface Product {
  id: string;
  title: string;
  tags: string;
  variants: Array<{ id: string; title: string; option1?: string; option2?: string }>;
}

async function getAllCollections(): Promise<Map<string, Collection>> {
  const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/custom_collections.json?limit=250`;
  const response = await fetch(url, {
    headers: { "X-Shopify-Access-Token": shopifyAccessToken },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch collections: ${response.statusText}`);
  }

  const data = await response.json();
  const collections = new Map<string, Collection>();
  
  for (const c of data.custom_collections || []) {
    collections.set(c.handle, { id: c.id, title: c.title, handle: c.handle });
  }
  
  return collections;
}

async function getAllProducts(): Promise<Product[]> {
  const products: Product[] = [];
  let url: string | null = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products.json?limit=250&status=active`;
  
  while (url) {
    const response: Response = await fetch(url, {
      headers: { "X-Shopify-Access-Token": shopifyAccessToken },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch products: ${response.statusText}`);
    }

    const data = await response.json();
    products.push(...(data.products || []));
    
    // Check for pagination
    const linkHeader: string | null = response.headers.get('Link');
    url = linkHeader?.match(/<([^>]+)>;\s*rel="next"/)?.[1] || null;
  }
  
  return products;
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

  // If already exists, that's ok (returns 422)
  if (response.status === 422) {
    return true; // Already exists
  }

  if (!response.ok) {
    const error = await response.text();
    console.error(`   ⚠️  Failed to add product ${productId}:`, error);
    return false;
  }

  return true;
}

async function getCollectionProductCount(collectionId: string): Promise<number> {
  const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/collects/count.json?collection_id=${collectionId}`;
  
  const response = await fetch(url, {
    headers: { "X-Shopify-Access-Token": shopifyAccessToken },
  });

  if (!response.ok) {
    return 0;
  }

  const data = await response.json();
  return data.count || 0;
}

async function populateCollections() {
  console.log("\n🎨 Populating Product Type Collections\n");
  console.log("=".repeat(60));

  if (!shopifyShopUrl || !shopifyAccessToken) {
    console.log("❌ Shopify not configured");
    return;
  }

  console.log("\n📥 Fetching collections and products...");
  const [collections, products] = await Promise.all([
    getAllCollections(),
    getAllProducts(),
  ]);

  console.log(`   ✓ Found ${collections.size} collections`);
  console.log(`   ✓ Found ${products.length} products\n`);

  // Define collection mappings
  // These collections will be populated based on product finishes
  const collectionMappings: Record<string, { handle: string; finishKeyword: string }> = {
    "Metal Prints": { handle: "metal-prints", finishKeyword: "metal" },
    "Canvas Prints": { handle: "canvas-prints", finishKeyword: "canvas" },
    "Posters": { handle: "posters", finishKeyword: "paper" },
    "Framed Prints": { handle: "framed-prints", finishKeyword: "framed" },
    "Featured": { handle: "featured", finishKeyword: "" }, // Will be top 20 by tag
  };

  console.log("=".repeat(60));
  console.log("🔄 Processing Collections");
  console.log("=".repeat(60) + "\n");

  for (const [collectionName, mapping] of Object.entries(collectionMappings)) {
    const collection = collections.get(mapping.handle);
    
    if (!collection) {
      console.log(`⚠️  Collection "${collectionName}" (${mapping.handle}) not found - skipping`);
      continue;
    }

    console.log(`\n📁 ${collectionName} (${mapping.handle})`);
    console.log(`   Collection ID: ${collection.id}`);

    let matchingProducts: Product[] = [];

    if (mapping.finishKeyword) {
      // Match products by finish (tags or variants)
      matchingProducts = products.filter(product => {
        const tags = product.tags.toLowerCase();
        const hasFinishTag = tags.includes(`finish:${mapping.finishKeyword}`);
        
        // Also check if any variant has this finish
        const hasFinishVariant = product.variants.some(v => 
          v.title.toLowerCase().includes(mapping.finishKeyword) ||
          v.option2?.toLowerCase().includes(mapping.finishKeyword)
        );
        
        return hasFinishTag || hasFinishVariant;
      });
    } else if (collectionName === "Featured") {
      // For Featured, use products with "Featured" tag or "New" tag
      matchingProducts = products.filter(product => {
        const tags = product.tags.toLowerCase();
        return tags.includes("featured") || tags.includes("new");
      }).slice(0, 20); // Limit to 20
    }

    console.log(`   Found ${matchingProducts.length} matching products`);

    if (matchingProducts.length === 0) {
      console.log(`   ⚠️  No products match criteria - collection will remain empty`);
      continue;
    }

    // Add products to collection
    let added = 0;
    let skipped = 0;

    for (const product of matchingProducts) {
      const success = await addProductToCollection(collection.id, product.id);
      if (success) {
        added++;
      } else {
        skipped++;
      }
      
      // Rate limiting: 2 requests per second
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`   ✓ Added ${added} products (${skipped} skipped/already exist)`);

    // Get final count
    const finalCount = await getCollectionProductCount(collection.id);
    console.log(`   📊 Final product count: ${finalCount}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ COLLECTION POPULATION COMPLETE");
  console.log("=".repeat(60) + "\n");

  // Final summary
  console.log("📊 Final Collection Status:\n");
  for (const [collectionName, mapping] of Object.entries(collectionMappings)) {
    const collection = collections.get(mapping.handle);
    if (collection) {
      const count = await getCollectionProductCount(collection.id);
      console.log(`   ${collectionName}: ${count} products`);
    }
  }

  console.log("\n🎨 Your collections are now populated!\n");
}

populateCollections()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
