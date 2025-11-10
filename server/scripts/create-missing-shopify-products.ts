import { db } from "../lib/db";
import { artworks, artists } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { createArtworkProduct } from "../lib/shopify";

async function createMissingProducts() {
  console.log("\n🛍️  Creating Missing Shopify Products\n");
  console.log("=".repeat(60));

  // Find all approved artworks without Shopify product IDs
  const missingProducts = await db
    .select({
      artwork: artworks,
      artist: artists,
    })
    .from(artworks)
    .innerJoin(artists, eq(artworks.artistId, artists.id))
    .where(
      and(
        eq(artworks.status, "approved"),
        isNull(artworks.shopifyProductId)
      )
    );

  console.log(`\nFound ${missingProducts.length} approved artworks without Shopify products\n`);

  if (missingProducts.length === 0) {
    console.log("✅ All approved artworks already have Shopify products!\n");
    return;
  }

  let created = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const item of missingProducts) {
    const { artwork, artist } = item;
    
    try {
      console.log(`Creating product: "${artwork.title}" by ${artist.name}...`);
      
      const result = await createArtworkProduct({
        title: artwork.title,
        description: artwork.description || undefined,
        artistName: artist.name,
        artistShort: artist.artistShort,
        artworkId: artwork.id,
        imageUrl: artwork.imageUrl,
        tags: artwork.tags || undefined,
        artworkStory: artwork.artworkStory || undefined,
        styleTags: artwork.styleTags || undefined,
        suggestedUse: artwork.suggestedUse || undefined,
        seoSlug: artwork.seoSlug || undefined,
      });

      if (result?.product?.id) {
        // Update artwork with Shopify product ID
        await db
          .update(artworks)
          .set({ 
            shopifyProductId: String(result.product.id),
            updatedAt: new Date(),
          })
          .where(eq(artworks.id, artwork.id));

        created++;
        console.log(`✅ Created product ID: ${result.product.id}\n`);
      } else {
        failed++;
        const error = `No product ID returned for "${artwork.title}"`;
        errors.push(error);
        console.log(`❌ ${error}\n`);
      }

      // Rate limiting: Shopify allows 2 requests per second
      // We're being conservative with 500ms between requests
      await new Promise((resolve) => setTimeout(resolve, 500));
      
    } catch (error: any) {
      failed++;
      const errorMsg = `Failed to create product for "${artwork.title}": ${error.message}`;
      errors.push(errorMsg);
      console.error(`❌ ${errorMsg}\n`);
    }
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 CREATION SUMMARY");
  console.log("=".repeat(60));
  console.log(`\n✅ Successfully created: ${created} products`);
  console.log(`❌ Failed: ${failed} products`);
  console.log(`📦 Total processed: ${missingProducts.length} products\n`);

  if (errors.length > 0) {
    console.log("\n⚠️  ERRORS:");
    errors.forEach((error, index) => {
      console.log(`   ${index + 1}. ${error}`);
    });
    console.log();
  }

  if (created > 0) {
    console.log("🎉 Shopify products created successfully!");
    console.log("   Next step: Run the collections population script");
    console.log("   npx tsx server/scripts/populate-shopify-collections.ts\n");
  }

  console.log("=".repeat(60) + "\n");
}

// Run the script
createMissingProducts()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });
