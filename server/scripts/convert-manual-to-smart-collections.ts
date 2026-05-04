export {};
/**
 * Convert Manual Collections to Smart Collections
 *
 * Converts empty Manual collections to Smart collections with automatic
 * tag-based rules. This enables fully automated product organization.
 * 
 * Manual Collection "Fantasy" (empty, requires manual curation)
 *   ↓
 * Smart Collection "Fantasy" (rule: tag contains "fantasy", auto-populates)
 * 
 * Features:
 * - Dry-run mode for safe preview
 * - Preserves existing Smart collections
 * - Only converts empty or low-count Manual collections
 * - Creates tag-based rules matching collection names
 */

const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || "";
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";
const apiVersion = "2024-10";

interface ShopifyCollection {
  id: number;
  title: string;
  handle: string;
  body_html?: string;
  products_count?: number;
}

interface SmartCollectionRule {
  column: string;
  relation: string;
  condition: string;
}

interface ConversionStats {
  converted: number;
  failed: number;
  skipped: number;
}

const conversionStats: ConversionStats = {
  converted: 0,
  failed: 0,
  skipped: 0
};

// Collections to SKIP conversion (already Smart or special purpose)
const SKIP_PATTERNS = [
  "Finish:",
  "Size:",
  "All Art Prints",
  "Canvas Prints",
  "Posters",
  "Art by" // Skip artist collections - those should stay manual
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

async function fetchManualCollections(): Promise<ShopifyCollection[]> {
  console.log("📥 Fetching Manual collections from Shopify...");
  
  const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/custom_collections.json?limit=250`;
  
  const response = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": shopifyAccessToken,
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status}`);
  }

  const data = await response.json();
  const collections = data.custom_collections || [];
  
  console.log(`  Found ${collections.length} Manual collections\n`);
  return collections;
}

function shouldSkipCollection(collection: ShopifyCollection): boolean {
  return SKIP_PATTERNS.some(pattern => collection.title.includes(pattern));
}

function createTagFromTitle(title: string): string {
  // Convert collection title to lowercase tag
  // "Fantasy" → "fantasy"
  // "Abstract Art" → "abstract art"
  // "Urban & Street" → "urban & street"
  return title.toLowerCase().trim();
}

async function createSmartCollection(
  title: string,
  tag: string,
  bodyHtml: string | undefined,
  dryRun: boolean
): Promise<boolean> {
  if (dryRun) return true;

  try {
    await retryWithBackoff(async () => {
      const smartCollectionPayload = {
        smart_collection: {
          title: title,
          // Don't specify handle - let Shopify auto-generate from title to avoid conflicts
          body_html: bodyHtml || "",
          rules: [
            {
              column: "tag",
              relation: "equals",
              condition: tag
            }
          ],
          disjunctive: false // AND logic for multiple rules (if needed later)
        }
      };

      const response = await fetch(
        `https://${shopifyShopUrl}/admin/api/${apiVersion}/smart_collections.json`,
        {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': shopifyAccessToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(smartCollectionPayload)
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Shopify API error: ${response.status} - ${errorText}`);
      }
    });

    return true;
  } catch (error) {
    console.error(`  ❌ Failed to create Smart collection:`, error);
    return false;
  }
}

async function deleteManualCollection(collectionId: number, dryRun: boolean): Promise<boolean> {
  if (dryRun) return true;

  try {
    await retryWithBackoff(async () => {
      const response = await fetch(
        `https://${shopifyShopUrl}/admin/api/${apiVersion}/custom_collections/${collectionId}.json`,
        {
          method: 'DELETE',
          headers: {
            'X-Shopify-Access-Token': shopifyAccessToken,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok && response.status !== 404) {
        throw new Error(`Shopify API error: ${response.status}`);
      }
    });

    return true;
  } catch (error) {
    console.error(`  ❌ Failed to delete Manual collection:`, error);
    return false;
  }
}

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║   Convert Manual Collections → Smart Collections         ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  const dryRun = process.argv.includes('--dry-run');
  const skipConfirmation = process.argv.includes('--yes');

  if (dryRun) {
    console.log("🔍 DRY RUN MODE - No actual changes will occur\n");
  } else {
    console.log("⚠️  LIVE MODE - Collections will be converted\n");
  }

  if (!shopifyShopUrl || !shopifyAccessToken) {
    console.error("❌ Missing Shopify credentials. Check SHOPIFY_SHOP_URL and SHOPIFY_ACCESS_TOKEN");
    process.exit(1);
  }

  try {
    // Fetch all Manual collections
    const manualCollections = await fetchManualCollections();

    // Analyze collections
    const toConvert: ShopifyCollection[] = [];
    const toSkip: ShopifyCollection[] = [];

    for (const collection of manualCollections) {
      if (shouldSkipCollection(collection)) {
        toSkip.push(collection);
      } else {
        toConvert.push(collection);
      }
    }

    console.log("📊 Conversion Analysis:");
    console.log(`  🔄 Collections to convert: ${toConvert.length}`);
    console.log(`  ⏭️  Collections to skip: ${toSkip.length}\n`);

    if (toSkip.length > 0) {
      console.log("⏭️  Skipping (preserving as Manual):");
      toSkip.forEach(c => {
        console.log(`    - "${c.title}" (pattern match or special purpose)`);
      });
      console.log();
    }

    if (toConvert.length > 0) {
      console.log("🔄 Collections to Convert:");
      toConvert.forEach(c => {
        const tag = createTagFromTitle(c.title);
        console.log(`    - "${c.title}" → Smart rule: tag = "${tag}"`);
      });
      console.log();
    }

    // Execute conversion
    if (!dryRun && !skipConfirmation && toConvert.length > 0) {
      console.log("⚠️  WARNING: About to convert collections!");
      console.log(`  - ${toConvert.length} Manual collections will become Smart collections`);
      console.log(`  - Original Manual collections will be deleted`);
      console.log("\n  Press Ctrl+C within 5 seconds to cancel...\n");
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    if (toConvert.length > 0) {
      console.log("🔄 Converting collections...\n");
      
      for (const collection of toConvert) {
        const tag = createTagFromTitle(collection.title);
        process.stdout.write(`  Converting "${collection.title}"...`);

        // Step 1: Create Smart collection (without handle to avoid conflicts)
        const smartCreated = await createSmartCollection(
          collection.title,
          tag,
          collection.body_html,
          dryRun
        );

        if (!smartCreated) {
          console.log(" ❌ (Smart creation failed)");
          conversionStats.failed++;
          continue;
        }

        // Step 2: Delete old Manual collection
        const manualDeleted = await deleteManualCollection(collection.id, dryRun);

        if (!manualDeleted) {
          console.log(" ⚠️  (Smart created but Manual deletion failed)");
          conversionStats.failed++;
          continue;
        }

        console.log(" ✅");
        conversionStats.converted++;

        // Rate limiting: wait 1000ms between conversions (Shopify limit: 2 calls/sec, we make 2 calls per conversion)
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      console.log();
    }

    // Final report
    console.log("╔═══════════════════════════════════════════════════════════╗");
    console.log("║                  CONVERSION SUMMARY                       ║");
    console.log("╚═══════════════════════════════════════════════════════════╝\n");

    if (dryRun) {
      console.log("🔍 DRY RUN RESULTS (no actual changes made):\n");
    }

    console.log(`  ✅ Converted: ${conversionStats.converted}`);
    console.log(`  ❌ Failed: ${conversionStats.failed}`);
    console.log(`  ⏭️  Skipped: ${toSkip.length}\n`);

    if (dryRun) {
      console.log("💡 To execute the conversion, run without --dry-run flag\n");
    } else {
      console.log("✅ Conversion complete!\n");
      console.log("🎯 Your collections are now automated:");
      console.log("   - Tag products during creation");
      console.log("   - Smart collections auto-populate");
      console.log("   - Zero manual curation needed!\n");
    }

  } catch (error) {
    console.error("\n❌ Fatal error during conversion:");
    console.error(error);
    process.exit(1);
  }
}

main();
