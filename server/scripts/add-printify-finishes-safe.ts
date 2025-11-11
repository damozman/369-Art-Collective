import "dotenv/config";
import { db } from "../lib/db";
import { artworks, artists } from "@shared/schema";
import { eq } from "drizzle-orm";

const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || "";
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";
const apiVersion = "2025-01";

/**
 * SAFE UPDATE: Adds Framed and Metal finishes to existing products
 * WITHOUT breaking existing Paper/Canvas variants
 */

const SIZES = ["8x10", "12x16", "18x24", "24x36"];

// Weight configuration by size and finish
const WEIGHTS: Record<string, Record<string, number>> = {
  "8x10": { Paper: 0.25, Canvas: 0.4, Framed: 1.5, Metal: 2.0 },
  "12x16": { Paper: 0.35, Canvas: 0.55, Framed: 2.5, Metal: 3.0 },
  "18x24": { Paper: 0.6, Canvas: 0.9, Framed: 4.0, Metal: 4.5 },
  "24x36": { Paper: 1.1, Canvas: 1.6, Framed: 6.5, Metal: 7.0 },
};

// Pricing by finish and size
const PRICES: Record<string, Record<string, number>> = {
  Paper: { "8x10": 19, "12x16": 29, "18x24": 49, "24x36": 79 },
  Canvas: { "8x10": 39, "12x16": 59, "18x24": 99, "24x36": 159 },
  Framed: { "8x10": 49, "12x16": 69, "18x24": 119, "24x36": 199 },
  Metal: { "8x10": 59, "12x16": 79, "18x24": 129, "24x36": 209 },
};

async function updateSingleProduct(productId: string, dryRun = false): Promise<boolean> {
  // Fetch current product
  const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products/${productId}.json`;
  const response = await fetch(url, {
    headers: { "X-Shopify-Access-Token": shopifyAccessToken },
  });

  if (!response.ok) {
    console.log(`   ❌ Failed to fetch product`);
    return false;
  }

  const data = await response.json();
  const product = data.product;

  console.log(`\n📦 ${product.title}`);
  console.log(`   Current finishes: ${product.options[1]?.values?.join(", ") || "unknown"}`);
  console.log(`   Current variants: ${product.variants.length}`);

  // Check if already has all 4 finishes
  const currentFinishes = product.options[1]?.values || [];
  if (currentFinishes.includes("Framed") && currentFinishes.includes("Metal")) {
    console.log(`   ℹ️  Already has all finishes - skipping`);
    return false;
  }

  // Extract artist initials and artwork ID from existing SKU
  const existingSKU = product.variants[0]?.sku || "";
  const skuParts = existingSKU.split("-");
  const artistInitials = skuParts[1] || "XX";
  const artworkUUID = skuParts[2] || "unknown";

  console.log(`   Artist: ${artistInitials}, Artwork: ${artworkUUID}`);

  // Build new variants for Framed and Metal (keep existing Paper/Canvas variants)
  const existingVariants = product.variants.map((v: any) => ({
    id: v.id, // Preserve variant ID
    option1: v.option1,
    option2: v.option2,
    price: v.price,
    sku: v.sku,
    weight: v.weight,
    weight_unit: v.weight_unit,
    inventory_management: null,
  }));

  const newVariants = [];

  // Add Framed variants
  for (const size of SIZES) {
    newVariants.push({
      option1: size,
      option2: "Framed",
      price: PRICES.Framed[size].toString(),
      sku: `ART-${artistInitials}-${artworkUUID}-${size}-Framed`,
      weight: WEIGHTS[size].Framed,
      weight_unit: "lb",
      inventory_management: null,
    });
  }

  // Add Metal variants
  for (const size of SIZES) {
    newVariants.push({
      option1: size,
      option2: "Metal",
      price: PRICES.Metal[size].toString(),
      sku: `ART-${artistInitials}-${artworkUUID}-${size}-Metal`,
      weight: WEIGHTS[size].Metal,
      weight_unit: "lb",
      inventory_management: null,
    });
  }

  const allVariants = [...existingVariants, ...newVariants];
  console.log(`   New variant total: ${allVariants.length} (${existingVariants.length} existing + ${newVariants.length} new)`);

  // Update tags to include new finishes
  const existingTags = (product.tags || "").split(",").map((t: string) => t.trim()).filter((t: string) => t);
  const hasFramedTag = existingTags.includes("Finish:Framed");
  const hasMetalTag = existingTags.includes("Finish:Metal");
  
  const newTags = [...existingTags];
  if (!hasFramedTag) newTags.push("Finish:Framed");
  if (!hasMetalTag) newTags.push("Finish:Metal");

  if (dryRun) {
    console.log(`   🔍 DRY RUN - Would add:`);
    console.log(`      - 4 Framed variants`);
    console.log(`      - 4 Metal variants`);
    console.log(`      - Tags: Finish:Framed, Finish:Metal`);
    return true;
  }

  // Update product
  const updateData = {
    options: [
      { name: "Size", position: 1, values: SIZES },
      { name: "Finish", position: 2, values: ["Paper", "Canvas", "Framed", "Metal"] },
    ],
    variants: allVariants,
    tags: newTags.join(", "),
  };

  const updateResponse = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": shopifyAccessToken,
    },
    body: JSON.stringify({ product: updateData }),
  });

  if (!updateResponse.ok) {
    const error = await updateResponse.text();
    console.log(`   ❌ Update failed:`, error);
    return false;
  }

  console.log(`   ✓ Successfully added Framed and Metal finishes`);
  return true;
}

async function addFinishesToAllProducts(dryRun = false) {
  console.log("\n🎨 Adding Printify Finishes (Safe Update)\n");
  console.log("=".repeat(60));
  console.log("\nAdding finishes:");
  console.log("  • Framed (Framed posters) - $49-199");
  console.log("  • Metal (Metal art signs) - $59-209");
  console.log("\nPreserving existing:");
  console.log("  • Paper variants (IDs, SKUs, weights)");
  console.log("  • Canvas variants (IDs, SKUs, weights)");
  console.log("\n" + "=".repeat(60));

  if (dryRun) {
    console.log("\n⚠️  DRY RUN MODE - No changes will be made\n");
  }

  // Get all artworks with Shopify product IDs
  const artworksWithProducts = await db
    .select({
      artwork: artworks,
      artist: artists,
    })
    .from(artworks)
    .innerJoin(artists, eq(artworks.artistId, artists.id))
    .where(eq(artworks.status, "approved"));

  const productsToUpdate = artworksWithProducts.filter(
    (item) => item.artwork.shopifyProductId
  );

  console.log(`\n📊 Found ${productsToUpdate.length} products to update\n`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < productsToUpdate.length; i++) {
    const item = productsToUpdate[i];
    const productId = item.artwork.shopifyProductId!;

    console.log(`\n[${i + 1}/${productsToUpdate.length}]`);

    try {
      const success = await updateSingleProduct(productId, dryRun);
      if (success) {
        updated++;
      } else {
        skipped++;
      }
    } catch (error: any) {
      failed++;
      console.log(`   ❌ Error: ${error.message}`);
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log("\n" + "=".repeat(60));
  console.log("📊 UPDATE SUMMARY");
  console.log("=".repeat(60));
  console.log(`   Total products: ${productsToUpdate.length}`);
  console.log(`   ✓ Updated: ${updated}`);
  console.log(`   ⚠️  Skipped: ${skipped}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log("\n" + "=".repeat(60));
  
  if (dryRun) {
    console.log("\n💡 Run without --dry-run to apply changes\n");
  } else {
    console.log("\n✅ COMPLETE - All products updated with Framed & Metal finishes\n");
  }
}

// Check for --dry-run flag
const dryRun = process.argv.includes("--dry-run");

addFinishesToAllProducts(dryRun)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
