import "dotenv/config";

const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || "";
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";
const apiVersion = "2025-01";

interface Collection {
  id: string;
  title: string;
  tag: string;
}

const COLLECTIONS: Collection[] = [
  { id: "497753096489", title: "Posters", tag: "Finish:Paper" },
  { id: "497753063721", title: "Canvas Prints", tag: "Finish:Canvas" },
  { id: "497753129257", title: "Framed Prints", tag: "Finish:Framed" },
  { id: "497753030953", title: "Metal Prints", tag: "Finish:Metal" },
];

async function getAllProducts() {
  const allProducts: any[] = [];
  let url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products.json?limit=250`;

  while (url) {
    const response = await fetch(url, {
      headers: { "X-Shopify-Access-Token": shopifyAccessToken },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch products: ${response.statusText}`);
    }

    const data = await response.json();
    allProducts.push(...data.products);

    // Check for next page
    const linkHeader = response.headers.get("Link");
    url = "";
    if (linkHeader) {
      const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      if (nextMatch) {
        url = nextMatch[1];
      }
    }
  }

  return allProducts;
}

async function updateCollection(collection: Collection, productIds: string[]) {
  console.log(`\n📁 ${collection.title}`);
  console.log(`   Adding ${productIds.length} products...`);

  // Skip the GET request - we don't need it for adding products

  // Add products via collects (Shopify's way of adding products to custom collections)
  let added = 0;
  for (const productId of productIds) {
    const collectUrl = `https://${shopifyShopUrl}/admin/api/${apiVersion}/collects.json`;
    const collectResponse = await fetch(collectUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": shopifyAccessToken,
      },
      body: JSON.stringify({
        collect: {
          product_id: productId,
          collection_id: collection.id,
        },
      }),
    });

    if (collectResponse.ok) {
      added++;
    } else if (collectResponse.status === 422) {
      // Already exists, that's fine
    } else {
      const error = await collectResponse.text();
      console.log(`   ⚠️  Failed to add product ${productId}: ${error}`);
    }

    // Rate limit - Shopify allows 2 calls per second
    await new Promise(resolve => setTimeout(resolve, 600));
  }

  console.log(`   ✓ Added ${added} products to ${collection.title}`);
}

async function populateCollections() {
  console.log("\n📁 Populating Shopify Collections\n");
  console.log("=".repeat(60));

  // Get all products
  console.log("\n📦 Fetching all products...");
  const allProducts = await getAllProducts();
  console.log(`   Found ${allProducts.length} products`);

  // Group products by finish tag
  const productsByFinish: Record<string, string[]> = {
    "Finish:Paper": [],
    "Finish:Canvas": [],
    "Finish:Framed": [],
    "Finish:Metal": [],
  };

  for (const product of allProducts) {
    const tags = (product.tags || "").split(",").map((t: string) => t.trim());
    
    for (const tag of tags) {
      if (productsByFinish[tag]) {
        productsByFinish[tag].push(product.id.toString());
      }
    }
  }

  console.log("\n📊 Products by finish:");
  console.log(`   Paper: ${productsByFinish["Finish:Paper"].length}`);
  console.log(`   Canvas: ${productsByFinish["Finish:Canvas"].length}`);
  console.log(`   Framed: ${productsByFinish["Finish:Framed"].length}`);
  console.log(`   Metal: ${productsByFinish["Finish:Metal"].length}`);

  console.log("\n" + "=".repeat(60));
  console.log("Adding products to collections...");

  for (const collection of COLLECTIONS) {
    const productIds = productsByFinish[collection.tag] || [];
    await updateCollection(collection, productIds);
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ COMPLETE - All collections populated");
  console.log("=".repeat(60) + "\n");
}

populateCollections()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
