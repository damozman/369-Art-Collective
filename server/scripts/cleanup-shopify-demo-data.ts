/**
 * Targeted Shopify Demo Data Cleanup Script
 * 
 * Surgically removes demo/test data while preserving critical infrastructure:
 * - Deletes demo products (Sailboat Regatta, Fishing Village, etc.)
 * - Removes empty Manual collections (demo artist collections)
 * - PRESERVES all Smart collections (filtering infrastructure)
 * - PRESERVES real artist products
 * 
 * Features:
 * - Dry-run mode for safe preview
 * - Detailed reporting
 * - Shopify API direct querying (not dependent on database records)
 */

const SHOPIFY_SHOP_URL = process.env.SHOPIFY_SHOP_URL || "";
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || "";
const API_VERSION = "2024-10";

interface ShopifyProduct {
  id: number;
  title: string;
  vendor: string;
  product_type: string;
  tags: string;
  status: string;
}

interface ShopifyCollection {
  id: number;
  title: string;
  rules?: any; // Exists for Smart collections
  products_count?: number;
}

interface CleanupStats {
  productsDeleted: number;
  productsFailed: number;
  collectionsDeleted: number;
  collectionsFailed: number;
  productsPreserved: number;
  collectionsPreserved: number;
}

const stats: CleanupStats = {
  productsDeleted: 0,
  productsFailed: 0,
  collectionsDeleted: 0,
  collectionsFailed: 0,
  productsPreserved: 0,
  collectionsPreserved: 0
};

// Demo product names to delete (case-insensitive partial matches)
const DEMO_PRODUCT_PATTERNS = [
  "Sailboat Regatta",
  "Fishing Village",
  "Lighthouse Storm",
  "Butterfly Libraries",
  "Social Media Blitz",
  "Majestic Horse at Sunrise",
  "Enchanted Tree of Golden Light",
  "grwgerwg" // Test products
];

// Demo artist names for collections (case-insensitive partial matches)
const DEMO_ARTIST_PATTERNS = [
  "Marcus Rodriguez",
  "Elena Kowalski",
  "Liam Anderson",
  "David O'Connor",
  "Nina Volkov",
  "Raj Patel",
  "Sarah Chen",
  "Sofia Martinez",
  "Amara Johnson"
];

// Smart collections to ALWAYS preserve (by title patterns)
const PRESERVE_COLLECTION_PATTERNS = [
  "Finish:",
  "Size:",
  "Style:",
  "Theme:",
  "Color:",
  "Featured",
  "Bestseller",
  "New Arrivals",
  "Arctic",
  "Exotic",
  "Fantasy",
  "Festive",
  "Fine Art"
];

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      const delay = baseDelay * Math.pow(2, i);
      console.log(`  Retry ${i + 1}/${maxRetries} after ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Retry failed');
}

async function fetchAllProducts(): Promise<ShopifyProduct[]> {
  const products: ShopifyProduct[] = [];
  let pageInfo: string | null = null;
  let hasNextPage = true;

  console.log("📥 Fetching all products from Shopify...");

  while (hasNextPage) {
    const url: string = pageInfo
      ? `https://${SHOPIFY_SHOP_URL}/admin/api/${API_VERSION}/products.json?limit=250&page_info=${pageInfo}`
      : `https://${SHOPIFY_SHOP_URL}/admin/api/${API_VERSION}/products.json?limit=250`;

    const response: Response = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status}`);
    }

    const data = await response.json();
    products.push(...data.products);

    // Check for pagination
    const linkHeader: string | null = response.headers.get("Link");
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const match: RegExpMatchArray | null = linkHeader.match(/page_info=([^&>]+)/);
      pageInfo = match ? match[1] : null;
      hasNextPage = !!pageInfo;
    } else {
      hasNextPage = false;
    }
  }

  console.log(`  Found ${products.length} total products\n`);
  return products;
}

async function fetchAllCollections(): Promise<{ smart: ShopifyCollection[], manual: ShopifyCollection[] }> {
  console.log("📥 Fetching all collections from Shopify...");

  // Fetch Smart Collections
  const smartUrl = `https://${SHOPIFY_SHOP_URL}/admin/api/${API_VERSION}/smart_collections.json?limit=250`;
  const smartResponse = await fetch(smartUrl, {
    headers: {
      "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
      "Content-Type": "application/json"
    }
  });

  if (!smartResponse.ok) {
    throw new Error(`Shopify API error fetching smart collections: ${smartResponse.status}`);
  }

  const smartData = await smartResponse.json();
  const smartCollections = smartData.smart_collections || [];

  // Fetch Manual Collections (Custom Collections in Shopify API)
  const manualUrl = `https://${SHOPIFY_SHOP_URL}/admin/api/${API_VERSION}/custom_collections.json?limit=250`;
  const manualResponse = await fetch(manualUrl, {
    headers: {
      "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
      "Content-Type": "application/json"
    }
  });

  if (!manualResponse.ok) {
    throw new Error(`Shopify API error fetching custom collections: ${manualResponse.status}`);
  }

  const manualData = await manualResponse.json();
  const manualCollections = manualData.custom_collections || [];

  console.log(`  Found ${smartCollections.length} Smart collections`);
  console.log(`  Found ${manualCollections.length} Manual collections\n`);

  return { smart: smartCollections, manual: manualCollections };
}

async function getCollectionProductCount(collectionId: number, isSmart: boolean): Promise<number> {
  const collectionType = isSmart ? "smart_collections" : "custom_collections";
  const url = `https://${SHOPIFY_SHOP_URL}/admin/api/${API_VERSION}/${collectionType}/${collectionId}.json`;

  try {
    const response = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      return -1; // Return -1 to indicate unknown count (we'll preserve these to be safe)
    }

    const data = await response.json();
    const collection = isSmart ? data.smart_collection : data.custom_collection;
    return collection?.products_count ?? -1;
  } catch (error) {
    return -1; // Return -1 on error (we'll preserve these to be safe)
  }
}

function isDemoProduct(product: ShopifyProduct): boolean {
  const title = product.title.toLowerCase();
  return DEMO_PRODUCT_PATTERNS.some(pattern => 
    title.includes(pattern.toLowerCase())
  );
}

function isDemoArtistCollection(collection: ShopifyCollection): boolean {
  const title = collection.title.toLowerCase();
  return DEMO_ARTIST_PATTERNS.some(pattern => 
    title.includes(pattern.toLowerCase())
  );
}

function shouldPreserveCollection(collection: ShopifyCollection): boolean {
  const title = collection.title;
  return PRESERVE_COLLECTION_PATTERNS.some(pattern => 
    title.includes(pattern)
  );
}

async function deleteProduct(productId: number, dryRun: boolean): Promise<boolean> {
  if (dryRun) return true;

  try {
    await retryWithBackoff(async () => {
      const response = await fetch(
        `https://${SHOPIFY_SHOP_URL}/admin/api/${API_VERSION}/products/${productId}.json`,
        {
          method: 'DELETE',
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok && response.status !== 404) {
        throw new Error(`Shopify API error: ${response.status}`);
      }
    });

    stats.productsDeleted++;
    return true;
  } catch (error) {
    console.error(`  ❌ Failed to delete product ${productId}:`, error);
    stats.productsFailed++;
    return false;
  }
}

async function deleteCollection(collectionId: number, isSmart: boolean, dryRun: boolean): Promise<boolean> {
  if (dryRun) return true;

  const collectionType = isSmart ? "smart_collections" : "custom_collections";

  try {
    await retryWithBackoff(async () => {
      const response = await fetch(
        `https://${SHOPIFY_SHOP_URL}/admin/api/${API_VERSION}/${collectionType}/${collectionId}.json`,
        {
          method: 'DELETE',
          headers: {
            'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok && response.status !== 404) {
        throw new Error(`Shopify API error: ${response.status}`);
      }
    });

    stats.collectionsDeleted++;
    return true;
  } catch (error) {
    console.error(`  ❌ Failed to delete collection ${collectionId}:`, error);
    stats.collectionsFailed++;
    return false;
  }
}

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║  Shopify Demo Data Cleanup - Targeted Surgical Removal   ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  // Parse command line args
  const dryRun = process.argv.includes('--dry-run');

  if (dryRun) {
    console.log("🔍 DRY RUN MODE - No actual deletions will occur\n");
  } else {
    console.log("⚠️  LIVE MODE - Deletions will be executed\n");
  }

  if (!SHOPIFY_SHOP_URL || !SHOPIFY_ACCESS_TOKEN) {
    console.error("❌ Missing Shopify credentials. Check SHOPIFY_SHOP_URL and SHOPIFY_ACCESS_TOKEN");
    process.exit(1);
  }

  try {
    // Step 1: Fetch all products
    const allProducts = await fetchAllProducts();

    // Step 2: Identify demo products vs real products
    const demoProducts: ShopifyProduct[] = [];
    const realProducts: ShopifyProduct[] = [];

    for (const product of allProducts) {
      if (isDemoProduct(product)) {
        demoProducts.push(product);
      } else {
        realProducts.push(product);
      }
    }

    console.log("📊 Product Analysis:");
    console.log(`  🎯 Demo products to delete: ${demoProducts.length}`);
    console.log(`  ✅ Real products to preserve: ${realProducts.length}\n`);

    if (demoProducts.length > 0) {
      console.log("🗑️  Demo Products to Delete:");
      demoProducts.forEach(p => {
        console.log(`    - "${p.title}" (ID: ${p.id})`);
      });
      console.log();
    }

    // Step 3: Fetch all collections
    const { smart: smartCollections, manual: manualCollections } = await fetchAllCollections();

    // Step 4: Analyze Manual collections
    console.log("🔍 Analyzing Manual Collections...");
    const collectionsToDelete: ShopifyCollection[] = [];
    const collectionsToPreserve: ShopifyCollection[] = [];

    for (const collection of manualCollections) {
      // Check if it's a preserve pattern first
      if (shouldPreserveCollection(collection)) {
        collectionsToPreserve.push(collection);
        console.log(`  ✅ PRESERVE (pattern match): "${collection.title}"`);
        continue;
      }

      // Get product count
      const productCount = await getCollectionProductCount(collection.id, false);

      if (productCount === -1) {
        // Unknown count, preserve to be safe
        collectionsToPreserve.push(collection);
        console.log(`  ✅ PRESERVE (unknown count): "${collection.title}"`);
      } else if (productCount === 0 && isDemoArtistCollection(collection)) {
        // Empty demo artist collection
        collectionsToDelete.push(collection);
        console.log(`  🗑️  DELETE (empty demo): "${collection.title}"`);
      } else if (productCount === 0) {
        // Empty but not demo artist - preserve to be safe
        collectionsToPreserve.push(collection);
        console.log(`  ✅ PRESERVE (empty, not demo): "${collection.title}"`);
      } else {
        // Has products, preserve
        collectionsToPreserve.push(collection);
        console.log(`  ✅ PRESERVE (${productCount} products): "${collection.title}"`);
      }
    }
    console.log();

    console.log("📊 Collection Analysis:");
    console.log(`  🛡️  Smart collections (always preserved): ${smartCollections.length}`);
    console.log(`  🗑️  Manual collections to delete: ${collectionsToDelete.length}`);
    console.log(`  ✅ Manual collections to preserve: ${collectionsToPreserve.length}\n`);

    // Step 5: Execute deletions
    if (!dryRun && (demoProducts.length > 0 || collectionsToDelete.length > 0)) {
      console.log("⚠️  WARNING: About to delete data from Shopify!");
      console.log(`  - ${demoProducts.length} demo products`);
      console.log(`  - ${collectionsToDelete.length} empty demo collections`);
      console.log("\n  Press Ctrl+C within 5 seconds to cancel...\n");
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Delete products
    if (demoProducts.length > 0) {
      console.log("🗑️  Deleting demo products...");
      for (const product of demoProducts) {
        process.stdout.write(`  Deleting "${product.title}"...`);
        const success = await deleteProduct(product.id, dryRun);
        console.log(success ? " ✅" : " ❌");
      }
      console.log();
    }

    // Delete collections
    if (collectionsToDelete.length > 0) {
      console.log("🗑️  Deleting empty demo collections...");
      for (const collection of collectionsToDelete) {
        process.stdout.write(`  Deleting "${collection.title}"...`);
        const success = await deleteCollection(collection.id, false, dryRun);
        console.log(success ? " ✅" : " ❌");
      }
      console.log();
    }

    // Update preserved counts
    stats.productsPreserved = realProducts.length;
    stats.collectionsPreserved = smartCollections.length + collectionsToPreserve.length;

    // Final report
    console.log("╔═══════════════════════════════════════════════════════════╗");
    console.log("║                    CLEANUP SUMMARY                        ║");
    console.log("╚═══════════════════════════════════════════════════════════╝\n");

    if (dryRun) {
      console.log("🔍 DRY RUN RESULTS (no actual changes made):\n");
    }

    console.log("Products:");
    console.log(`  🗑️  Deleted: ${stats.productsDeleted}`);
    console.log(`  ❌ Failed: ${stats.productsFailed}`);
    console.log(`  ✅ Preserved: ${stats.productsPreserved}\n`);

    console.log("Collections:");
    console.log(`  🗑️  Deleted: ${stats.collectionsDeleted}`);
    console.log(`  ❌ Failed: ${stats.collectionsFailed}`);
    console.log(`  ✅ Preserved: ${stats.collectionsPreserved}`);
    console.log(`     (${smartCollections.length} Smart + ${collectionsToPreserve.length} Manual)\n`);

    if (dryRun) {
      console.log("💡 To execute the cleanup, run without --dry-run flag\n");
    } else {
      console.log("✅ Cleanup complete!\n");
    }

  } catch (error) {
    console.error("\n❌ Fatal error during cleanup:");
    console.error(error);
    process.exit(1);
  }
}

main();
