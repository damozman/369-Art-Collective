/**
 * Order Processor
 * Handles order capture from Shopify and submission to Printify for fulfillment
 */

import { storage } from "../storage";
import { createOrder as submitPrintifyOrder } from "./printify";
import {
  calculateRoyalty,
  getArtistMonthlySales,
  calculateRecruitmentBonus,
} from "./royalty-calculator";

interface ShopifyLineItem {
  id: number;
  product_id: number;
  variant_id: number;
  sku: string;
  title: string;
  variant_title?: string;
  quantity: number;
  price: string;
  name: string;
}

interface ShopifyOrder {
  id: number;
  email: string;
  created_at: string;
  total_price: string;
  line_items: ShopifyLineItem[];
  shipping_address?: {
    first_name: string;
    last_name: string;
    address1: string;
    address2?: string;
    city: string;
    province: string;
    province_code: string;
    country: string;
    country_code: string;
    zip: string;
    phone?: string;
  };
}

/**
 * Parse SKU to extract artwork and artist information
 * SKU format: ART-{artistShort}-{artworkId}-{size}-{finish}
 * Example: ART-JH-abc123-16x20-Canvas
 */
function parseSKU(sku: string): { artistShort: string; artworkId: string } | null {
  const match = sku.match(/^ART-([A-Z0-9]+)-([a-f0-9-]+)-/);
  if (!match) return null;
  
  return {
    artistShort: match[1],
    artworkId: match[2],
  };
}

/**
 * Process a Shopify order
 * 1. Parse order data
 * 2. Create order records in database
 * 3. Calculate royalties for each line item
 * 4. Create sale records
 * 5. Submit to Printify for fulfillment
 */
export async function processShopifyOrder(shopifyOrder: ShopifyOrder) {
  console.log(`Processing Shopify order: ${shopifyOrder.id}`);

  // Process each line item (could be multiple artworks in one order)
  for (const lineItem of shopifyOrder.line_items) {
    // Skip if no SKU (shouldn't happen but safety check)
    if (!lineItem.sku) {
      console.warn(`Line item ${lineItem.id} has no SKU, skipping`);
      continue;
    }

    // Parse SKU to get artwork/artist info
    const skuParts = parseSKU(lineItem.sku);
    if (!skuParts) {
      console.warn(`Could not parse SKU: ${lineItem.sku}, skipping`);
      continue;
    }

    try {
      // Get artwork and artist
      const artwork = await storage.getArtwork(skuParts.artworkId);
      if (!artwork) {
        console.error(`Artwork not found: ${skuParts.artworkId}`);
        continue;
      }

      const artist = await storage.getArtist(artwork.artistId);
      if (!artist) {
        console.error(`Artist not found: ${artwork.artistId}`);
        continue;
      }

      // Get Printify product ID (we need this for fulfillment)
      if (!artwork.printifyProductId) {
        console.error(`Artwork ${artwork.id} has no Printify product ID`);
        continue;
      }

      // Calculate costs and profit
      const productPrice = parseFloat(lineItem.price) * lineItem.quantity;
      const printifyCost = 15.00 * lineItem.quantity; // Placeholder - should get from Printify API
      const shippingCost = 5.00 * lineItem.quantity; // Placeholder - should calculate actual
      const profit = productPrice - printifyCost - shippingCost;

      // Check for referral source (UTM tracking)
      // TODO: Implement UTM tracking - for now assume no referral
      const hasReferralBonus = false;

      // Get artist's current monthly sales for tier calculation
      const monthlySales = await getArtistMonthlySales(artist.id);

      // Calculate royalties
      const royaltyData = calculateRoyalty(profit, monthlySales, hasReferralBonus);

      // Calculate recruitment bonus if artist was recruited
      const recruitmentBonus = await calculateRecruitmentBonus(artist.id, productPrice);

      // Create order record
      const order = await storage.createOrder({
        shopifyOrderId: shopifyOrder.id.toString(),
        artworkId: artwork.id,
        artistId: artist.id,
        productPrice: productPrice.toFixed(2),
        printifyCost: printifyCost.toFixed(2),
        shippingCost: shippingCost.toFixed(2),
        profit: profit.toFixed(2),
        referralSource: null, // TODO: Get from UTM parameters
        referralBonus: hasReferralBonus,
        status: "pending",
      });

      console.log(`Order created: ${order.id}`);

      // Create sale record with royalty information
      const sale = await storage.createSale({
        orderId: order.id,
        artistId: artist.id,
        artworkId: artwork.id,
        saleAmount: productPrice.toFixed(2),
        profit: profit.toFixed(2),
        royaltyTier: royaltyData.royaltyTier,
        baseRoyalty: royaltyData.baseRoyalty.toFixed(2),
        referralBonus: royaltyData.referralBonus.toFixed(2),
        recruitmentBonus: recruitmentBonus.toFixed(2),
        totalEarnings: (royaltyData.totalEarnings + recruitmentBonus).toFixed(2),
      });

      console.log(`Sale recorded: ${sale.id}, Artist earns: $${sale.totalEarnings}`);

      // MVP: Skip Printify submission for now - focus on order tracking first
      // TODO: Implement Printify fulfillment post-MVP
      console.log(`Order tracked, Printify fulfillment to be implemented`);
      
      // Mark as pending fulfillment
      await storage.updateOrder(order.id, {
        status: "pending",
      });
    } catch (error) {
      console.error(`Error processing line item ${lineItem.id}:`, error);
      // Continue processing other items
    }
  }
}
