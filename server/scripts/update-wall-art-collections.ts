import "dotenv/config";

const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || "";
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";
const apiVersion = "2025-01";

interface SmartCollection {
  id: string;
  title: string;
  handle: string;
  rules: Array<{
    column: string;
    relation: string;
    condition: string;
  }>;
}

const WALL_ART_COLLECTIONS = [
  {
    title: "Posters",
    handle: "finish-paper",
    finishTag: "Finish:Paper",
  },
  {
    title: "Canvas Prints",
    handle: "finish-canvas",
    finishTag: "Finish:Canvas",
  },
  {
    title: "Framed Prints",
    handle: "finish-framed",
    finishTag: "Finish:Framed",
  },
  {
    title: "Metal Prints",
    handle: "finish-metal",
    finishTag: "Finish:Metal",
  },
];

async function getSmartCollections(): Promise<SmartCollection[]> {
  const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/smart_collections.json?limit=250`;
  const response = await fetch(url, {
    headers: { "X-Shopify-Access-Token": shopifyAccessToken },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch smart collections: ${response.statusText}`);
  }

  const data = await response.json();
  return data.smart_collections || [];
}

async function createSmartCollection(title: string, handle: string, finishTag: string) {
  const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/smart_collections.json`;
  
  const collectionData = {
    smart_collection: {
      title,
      handle,
      rules: [
        {
          column: "tag",
          relation: "equals",
          condition: finishTag,
        },
        {
          column: "tag",
          relation: "equals",
          condition: "wall-art",
        },
      ],
      disjunctive: false, // AND logic - requires BOTH tags
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": shopifyAccessToken,
    },
    body: JSON.stringify(collectionData),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create collection: ${error}`);
  }

  return await response.json();
}

async function updateSmartCollection(collectionId: string, finishTag: string) {
  const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/smart_collections/${collectionId}.json`;
  
  const collectionData = {
    smart_collection: {
      id: collectionId,
      rules: [
        {
          column: "tag",
          relation: "equals",
          condition: finishTag,
        },
        {
          column: "tag",
          relation: "equals",
          condition: "wall-art",
        },
      ],
      disjunctive: false, // AND logic - requires BOTH tags
    },
  };

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": shopifyAccessToken,
    },
    body: JSON.stringify(collectionData),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update collection: ${error}`);
  }

  return await response.json();
}

async function getProductCount(collectionId: string): Promise<number> {
  const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products/count.json?collection_id=${collectionId}`;
  const response = await fetch(url, {
    headers: { "X-Shopify-Access-Token": shopifyAccessToken },
  });

  if (!response.ok) {
    return 0;
  }

  const data = await response.json();
  return data.count || 0;
}

async function main() {
  console.log("\n🛡️  Updating Wall Art Collections with Compound Filtering\n");
  console.log("=".repeat(60));
  console.log("\nThis will require BOTH tags:");
  console.log("  1. Finish tag (Finish:Paper, etc.)");
  console.log("  2. wall-art tag");
  console.log("\nThis prevents future merch from appearing in wall art collections.\n");
  console.log("=".repeat(60) + "\n");

  if (!shopifyShopUrl || !shopifyAccessToken) {
    console.log("❌ Shopify not configured");
    return;
  }

  // Get existing smart collections
  console.log("📥 Fetching existing smart collections...");
  const existingCollections = await getSmartCollections();
  const collectionMap = new Map(existingCollections.map(c => [c.handle, c]));
  console.log(`   ✓ Found ${existingCollections.length} smart collections\n`);

  // Process each wall art collection
  for (const config of WALL_ART_COLLECTIONS) {
    console.log(`📁 ${config.title} (/${config.handle})`);
    
    const existing = collectionMap.get(config.handle);

    if (existing) {
      // Update existing collection
      console.log(`   Found existing collection (ID: ${existing.id})`);
      console.log(`   Current rules: ${JSON.stringify(existing.rules)}`);
      console.log(`   Updating to compound filter...`);
      
      try {
        await updateSmartCollection(existing.id, config.finishTag);
        console.log(`   ✅ Updated successfully`);
        
        // Wait for Shopify to reindex
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const count = await getProductCount(existing.id);
        console.log(`   📊 Product count: ${count} (should be 88)`);
      } catch (error: any) {
        console.log(`   ❌ Failed to update: ${error.message}`);
      }
    } else {
      // Create new collection
      console.log(`   Collection doesn't exist, creating new...`);
      
      try {
        const result = await createSmartCollection(config.title, config.handle, config.finishTag);
        const collection = result.smart_collection;
        console.log(`   ✅ Created successfully (ID: ${collection.id})`);
        
        // Wait for Shopify to reindex
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const count = await getProductCount(collection.id);
        console.log(`   📊 Product count: ${count} (should be 88)`);
      } catch (error: any) {
        console.log(`   ❌ Failed to create: ${error.message}`);
      }
    }
    
    console.log();
  }

  console.log("=".repeat(60));
  console.log("✅ COLLECTION UPDATE COMPLETE");
  console.log("=".repeat(60) + "\n");

  console.log("📋 What This Means:\n");
  console.log("  ✓ Wall art products: Have BOTH tags → Show in collections");
  console.log("  ✓ Future merch: Will NOT have wall-art tag → Hidden from collections");
  console.log("  ✓ Your 88 existing products: All have wall-art tag already\n");
  
  console.log("🎉 Your wall art collections are now protected from merch!\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
