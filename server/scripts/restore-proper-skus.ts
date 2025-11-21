/**
 * Restore Proper SKU Format
 * Fixes SKUs from "{productId}-{size}-{finish}" to "ART-{artistShort}-{artworkId}-{size}-{finish}"
 */

import "dotenv/config";
import { db } from "../lib/db";
import { artworks, artists } from "@shared/schema";
import { eq } from "drizzle-orm";

const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || "";
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";
const apiVersion = "2025-01";

interface VariantUpdate {
  id: string;
  sku: string;
}

async function getArtworkMetadata(shopifyProductId: string) {
  const artwork = await db
    .select({
      artwork: artworks,
      artist: artists,
    })
    .from(artworks)
    .innerJoin(artists, eq(artworks.artistId, artists.id))
    .where(eq(artworks.shopifyProductId, shopifyProductId))
    .limit(1);

  if (artwork.length === 0) {
    return null;
  }

  return {
    artistShort: artwork[0].artist.artistShort,
    artworkId: artwork[0].artwork.id,
  };
}

async function updateProductVariants(productId: string, variantUpdates: VariantUpdate[]): Promise<boolean> {
  const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products/${productId}.json`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": shopifyAccessToken,
    },
    body: JSON.stringify({
      product: {
        variants: variantUpdates.map(v => ({
          id: v.id,
          sku: v.sku,
        })),
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`   ❌ Failed to update product ${productId}:`, error);
    return false;
  }

  return true;
}

async function getProduct(productId: string): Promise<any> {
  const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products/${productId}.json`;
  const response = await fetch(url, {
    headers: { "X-Shopify-Access-Token": shopifyAccessToken },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch product: ${response.statusText}`);
  }

  const data = await response.json();
  return data.product;
}

async function restoreProperSKUs() {
  console.log("\n🔧 Restoring Proper SKU Format\n");
  console.log("=".repeat(80));
  console.log("\nFixing SKUs:");
  console.log("  FROM: {productId}-{size}-{finish}");
  console.log("  TO: ART-{artistShort}-{artworkId}-{size}-{finish}");
  console.log("\n" + "=".repeat(80));

  // Get all approved artworks with Shopify products
  const artworksWithProducts = await db
    .select({
      artwork: artworks,
      artist: artists,
    })
    .from(artworks)
    .innerJoin(artists, eq(artworks.artistId, artists.id))
    .where(eq(artworks.status, "approved"));

  const productsToFix = artworksWithProducts.filter(
    (item) => item.artwork.shopifyProductId
  );

  console.log(`\n📊 Found ${productsToFix.length} products to fix\n`);

  let updated = 0;
  let failed = 0;

  for (let i = 0; i < productsToFix.length; i++) {
    const item = productsToFix[i];
    const productId = item.artwork.shopifyProductId!;
    const artistShort = item.artist.artistShort;
    const artworkId = item.artwork.id;

    console.log(`\n[${i + 1}/${productsToFix.length}] ${item.artwork.title}`);
    console.log(`   Product ID: ${productId}`);
    console.log(`   Artist: ${artistShort}, Artwork: ${artworkId.substring(0, 8)}...`);

    try {
      // Fetch current product variants
      const product = await getProduct(productId);
      const variants = product.variants || [];

      console.log(`   Current variants: ${variants.length}`);

      // Build variant updates with proper SKUs
      const variantUpdates: VariantUpdate[] = variants.map((v: any) => {
        const size = v.option1; // e.g., "8x10"
        const finish = v.option2; // e.g., "Paper", "Framed-Black"
        
        // Build proper SKU
        const properSKU = `ART-${artistShort}-${artworkId}-${size}-${finish}`;
        
        return {
          id: v.id,
          sku: properSKU,
        };
      });

      // Show SKU transformations
      const sampleOld = variants[0]?.sku || "unknown";
      const sampleNew = variantUpdates[0]?.sku || "unknown";
      console.log(`   Example: ${sampleOld} → ${sampleNew}`);

      // Update product variants
      const success = await updateProductVariants(productId, variantUpdates);
      if (success) {
        updated++;
        console.log(`   ✓ Updated ${variantUpdates.length} variants successfully`);
      } else {
        failed++;
      }
    } catch (error: any) {
      failed++;
      console.log(`   ❌ Error: ${error.message}`);
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log("\n" + "=".repeat(80));
  console.log("📊 UPDATE SUMMARY");
  console.log("=".repeat(80));
  console.log(`   Total products: ${productsToFix.length}`);
  console.log(`   ✓ Updated: ${updated}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log("\n" + "=".repeat(80));
  console.log("✅ SKU RESTORATION COMPLETE");
  console.log("=".repeat(80));
}

restoreProperSKUs()
  .then(() => {
    console.log("\n✅ Proper SKUs restored successfully!\n");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ SKU restoration failed:", error);
    process.exit(1);
  });
