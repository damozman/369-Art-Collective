import dotenv from "dotenv";
import { db } from "../lib/db";
import { artworks } from "../../shared/schema";
import { eq } from "drizzle-orm";

dotenv.config();

const SHOPIFY_SHOP = process.env.SHOPIFY_SHOP_URL!.replace(/^https?:\/\//, '').replace(/\/$/, '');
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN!;

async function publishProduct(productId: string, artworkTitle: string): Promise<boolean> {
  try {
    // Publish to Online Store sales channel
    const publishResponse = await fetch(
      `https://${SHOPIFY_SHOP}/admin/api/2024-01/products/${productId}.json`,
      {
        method: "PUT",
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          product: {
            id: productId,
            status: "active",
            published: true,
            published_scope: "web"
          }
        })
      }
    );

    if (!publishResponse.ok) {
      console.error(`❌ Failed to publish ${artworkTitle}:`, publishResponse.statusText);
      return false;
    }

    console.log(`✅ Published: ${artworkTitle}`);
    return true;
  } catch (error) {
    console.error(`❌ Error publishing ${artworkTitle}:`, error);
    return false;
  }
}

async function publishAllProducts() {
  console.log("🚀 Publishing All Products to Shopify Storefront\n");
  console.log("============================================================\n");

  // Get all approved artworks with Shopify product IDs
  const approvedArtworks = await db
    .select()
    .from(artworks)
    .where(eq(artworks.status, "approved"))
    .execute();

  const artworksWithProducts = approvedArtworks.filter((a: any) => a.shopifyProductId);

  console.log(`📦 Found ${artworksWithProducts.length} products to publish\n`);

  let successCount = 0;
  let failCount = 0;

  for (const artwork of artworksWithProducts) {
    const success = await publishProduct(
      artwork.shopifyProductId!,
      artwork.title
    );
    
    if (success) {
      successCount++;
    } else {
      failCount++;
    }

    // Rate limiting - wait 500ms between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log("\n============================================================");
  console.log("📊 PUBLISHING SUMMARY");
  console.log("============================================================\n");
  console.log(`✅ Successfully published: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`📦 Total processed: ${artworksWithProducts.length}`);
  console.log("\n✨ Products are now visible on your storefront!");
  console.log("🔗 Visit: https://369artcollective.com/collections/all\n");
}

publishAllProducts();
