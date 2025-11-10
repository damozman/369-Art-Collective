import { db } from "../lib/db";
import { artworks } from "@shared/schema";
import { isNull, isNotNull } from "drizzle-orm";

const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || "";
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";

interface ShopifyCollection {
  id: string;
  title: string;
  handle: string;
}

interface ShopifyProduct {
  id: string;
  title: string;
}

// Get all collections from Shopify
async function getAllCollections(): Promise<ShopifyCollection[]> {
  if (!shopifyShopUrl || !shopifyAccessToken) {
    return [];
  }

  const apiVersion = "2024-10";
  const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/custom_collections.json?limit=250`;

  try {
    const response = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": shopifyAccessToken,
      },
    });

    if (!response.ok) {
      console.error("Failed to fetch collections");
      return [];
    }

    const result = await response.json();
    return result.custom_collections || [];
  } catch (error: any) {
    console.error("Error fetching collections:", error.message);
    return [];
  }
}

// Delete a collection
async function deleteCollection(collectionId: string): Promise<boolean> {
  if (!shopifyShopUrl || !shopifyAccessToken) {
    return false;
  }

  const apiVersion = "2024-10";
  const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/custom_collections/${collectionId}.json`;

  try {
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        "X-Shopify-Access-Token": shopifyAccessToken,
      },
    });

    return response.ok;
  } catch (error: any) {
    console.error(`Error deleting collection ${collectionId}:`, error.message);
    return false;
  }
}

// Get all products from Shopify
async function getAllProducts(): Promise<ShopifyProduct[]> {
  if (!shopifyShopUrl || !shopifyAccessToken) {
    return [];
  }

  const apiVersion = "2024-10";
  let allProducts: ShopifyProduct[] = [];
  let pageInfo: string | null = null;

  do {
    let url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products.json?limit=250`;
    if (pageInfo) {
      url += `&page_info=${pageInfo}`;
    }

    try {
      const response = await fetch(url, {
        headers: {
          "X-Shopify-Access-Token": shopifyAccessToken,
        },
      });

      if (!response.ok) {
        console.error("Failed to fetch products");
        break;
      }

      const data = await response.json();
      allProducts = allProducts.concat(data.products || []);

      // Check for pagination
      const linkHeader = response.headers.get("Link");
      pageInfo = null;
      if (linkHeader) {
        const nextMatch = linkHeader.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="next"/);
        if (nextMatch) {
          pageInfo = nextMatch[1];
        }
      }
    } catch (error: any) {
      console.error("Error fetching products:", error.message);
      break;
    }
  } while (pageInfo);

  return allProducts;
}

// Delete a product
async function deleteProduct(productId: string): Promise<boolean> {
  if (!shopifyShopUrl || !shopifyAccessToken) {
    return false;
  }

  const apiVersion = "2024-10";
  const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products/${productId}.json`;

  try {
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        "X-Shopify-Access-Token": shopifyAccessToken,
      },
    });

    return response.ok;
  } catch (error: any) {
    console.error(`Error deleting product ${productId}:`, error.message);
    return false;
  }
}

async function cleanupShopify() {
  console.log("\n🧹 Shopify Cleanup Script\n");
  console.log("=".repeat(60));

  if (!shopifyShopUrl || !shopifyAccessToken) {
    console.log("\n❌ Shopify is not configured");
    console.log("Set SHOPIFY_SHOP_URL and SHOPIFY_ACCESS_TOKEN\n");
    return;
  }

  console.log(`\n🏪 Store: ${shopifyShopUrl}\n`);

  // Get our database artworks with Shopify IDs
  const ourArtworks = await db
    .select({ shopifyProductId: artworks.shopifyProductId })
    .from(artworks)
    .where(isNotNull(artworks.shopifyProductId));

  const ourProductIds = new Set(
    ourArtworks.map((a) => a.shopifyProductId).filter(Boolean)
  );

  console.log(`📊 Our database has ${ourProductIds.size} products with Shopify IDs\n`);

  // === CLEAN UP COLLECTIONS ===
  console.log("\n" + "=".repeat(60));
  console.log("🗂️  CLEANING UP COLLECTIONS");
  console.log("=".repeat(60) + "\n");

  const collections = await getAllCollections();
  console.log(`Found ${collections.length} collections in Shopify\n`);

  if (collections.length > 0) {
    console.log("⚠️  This will DELETE ALL existing collections!");
    console.log("   (They will be recreated with the populate script)\n");

    let deletedCollections = 0;
    for (const collection of collections) {
      console.log(`Deleting: ${collection.title}...`);
      const success = await deleteCollection(collection.id);
      
      if (success) {
        deletedCollections++;
        console.log(`✅ Deleted\n`);
      } else {
        console.log(`❌ Failed\n`);
      }

      // Rate limiting: 2 requests per second
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log(`\n✅ Deleted ${deletedCollections}/${collections.length} collections\n`);
  } else {
    console.log("✅ No collections to clean up\n");
  }

  // === CLEAN UP ORPHANED PRODUCTS ===
  console.log("\n" + "=".repeat(60));
  console.log("🧹 CLEANING UP ORPHANED PRODUCTS");
  console.log("=".repeat(60) + "\n");

  const shopifyProducts = await getAllProducts();
  console.log(`Found ${shopifyProducts.length} products in Shopify\n`);

  const orphanedProducts = shopifyProducts.filter(
    (p) => !ourProductIds.has(String(p.id))
  );

  if (orphanedProducts.length > 0) {
    console.log(`⚠️  Found ${orphanedProducts.length} orphaned products (not in our database)\n`);
    console.log("These will be DELETED:\n");

    orphanedProducts.slice(0, 10).forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.title} (ID: ${p.id})`);
    });

    if (orphanedProducts.length > 10) {
      console.log(`   ... and ${orphanedProducts.length - 10} more\n`);
    }

    let deletedProducts = 0;
    for (const product of orphanedProducts) {
      console.log(`\nDeleting: ${product.title}...`);
      const success = await deleteProduct(product.id);
      
      if (success) {
        deletedProducts++;
        console.log(`✅ Deleted`);
      } else {
        console.log(`❌ Failed`);
      }

      // Rate limiting: 2 requests per second
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    console.log(`\n✅ Deleted ${deletedProducts}/${orphanedProducts.length} orphaned products\n`);
  } else {
    console.log("✅ No orphaned products found\n");
  }

  // === SUMMARY ===
  console.log("\n" + "=".repeat(60));
  console.log("✅ CLEANUP COMPLETE");
  console.log("=".repeat(60) + "\n");

  console.log("📊 Summary:");
  console.log(`   Collections deleted: ${collections.length}`);
  console.log(`   Orphaned products deleted: ${orphanedProducts.length}`);
  console.log(`   Products kept (in our database): ${ourProductIds.size}`);

  console.log("\n🎯 Next Steps:");
  console.log("   1. Run: npx tsx server/scripts/create-missing-shopify-products.ts");
  console.log("   2. Run: npx tsx server/scripts/populate-shopify-collections.ts\n");

  console.log("=".repeat(60) + "\n");
}

// Run the cleanup
cleanupShopify()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Cleanup failed:", error);
    process.exit(1);
  });
