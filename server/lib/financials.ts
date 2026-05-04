import { db } from "./db";
import { orders, sales, artworks, artists } from "@shared/schema";
import { eq } from "drizzle-orm";

// Placeholder for cost of goods estimation. This should be replaced with a more accurate model.
function getEstimatedCost(price: number): number {
  return price * 0.4; // Estimate cost of goods as 40% of the sale price
}

function calculateRoyalty(price: number, cost: number): number {
  const profit = price - cost;
  return profit * 0.369; // 36.9% of the profit
}

export async function processShopifyOrder(shopifyOrder: any): Promise<void> {
  console.log("Processing Shopify Order:", shopifyOrder.id);

  for (const item of shopifyOrder.line_items) {
    const artwork = await db.query.artworks.findFirst({
      where: eq(artworks.shopifyProductId, item.product_id.toString()),
    });

    if (!artwork) {
      console.warn(`Artwork with Shopify Product ID ${item.product_id} not found. Skipping line item.`);
      continue;
    }

    const artist = await db.query.artists.findFirst({
        where: eq(artists.id, artwork.artistId),
    });

    if (!artist) {
        console.warn(`Artist with ID ${artwork.artistId} not found. Skipping line item.`);
        continue;
    }

    const price = parseFloat(item.price);
    const costOfGoods = getEstimatedCost(price);
    const artistRoyalty = calculateRoyalty(price, costOfGoods);

    const [newOrder] = await db.insert(orders).values({
      shopifyOrderId: shopifyOrder.id.toString(),
      artworkId: artwork.id,
      artistId: artwork.artistId,
      productPrice: price.toString(),
      printifyCost: costOfGoods.toString(),
      shippingCost: "0", // Placeholder
      profit: (price - costOfGoods).toString(),
    }).returning();

    await db.insert(sales).values({
        orderId: newOrder.id,
        artistId: artwork.artistId,
        artworkId: artwork.id,
        saleAmount: price.toString(),
        profit: (price - costOfGoods).toString(),
        royaltyTier: 36, // Placeholder
        baseRoyalty: artistRoyalty.toString(),
        totalEarnings: artistRoyalty.toString(),
      });

    console.log(`Processed royalty for artwork ${artwork.id} by artist ${artwork.artistId}`);
  }
}
