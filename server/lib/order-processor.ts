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
  landing_site?: string; // URL with UTM parameters
  referring_site?: string;
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
 * Extract UTM parameters from landing site URL
 */
function extractUTMParams(landingSite?: string): {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referralCode?: string;
} | null {
  if (!landingSite) return null;
  
  try {
    const url = new URL(landingSite);
    const params = new URLSearchParams(url.search);
    
    const utmSource = params.get('utm_source') || undefined;
    const utmMedium = params.get('utm_medium') || undefined;
    const utmCampaign = params.get('utm_campaign') || undefined;
    
    // Check if utm_source contains a referral code
    const referralCode = utmSource?.match(/^[A-Z]+-[A-Z0-9]{8}$/)?.[0];
    
    if (utmSource || utmMedium || utmCampaign) {
      return {
        utmSource,
        utmMedium,
        utmCampaign,
        referralCode,
      };
    }
  } catch (error) {
    console.error('Error parsing landing site URL:', error);
  }
  
  return null;
}

/**
 * Process a Shopify order
 * 1. Parse order data
 * 2. Extract UTM/referral tracking
 * 3. Create order records in database
 * 4. Calculate royalties for each line item (with +5% referral bonus if applicable)
 * 5. Create sale records
 * 6. Submit to Printify for fulfillment
 */
export async function processShopifyOrder(shopifyOrder: ShopifyOrder) {
  console.log(`Processing Shopify order: ${shopifyOrder.id}`);
  
  // Extract UTM parameters and referral code
  const utmParams = extractUTMParams(shopifyOrder.landing_site);
  let referralArtist = null;
  
  if (utmParams?.referralCode) {
    // Find artist by referral code
    const allArtists = await storage.getAllArtists();
    referralArtist = allArtists.find(a => a.referralCode === utmParams.referralCode);
    
    if (referralArtist) {
      console.log(`Order referred by artist: ${referralArtist.name} (${referralArtist.referralCode})`);
    }
  }

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

      // Check for referral bonus (+5% if referred by another artist)
      const hasReferralBonus = !!referralArtist && referralArtist.id !== artist.id;

      // Get artist's current monthly sales for tier calculation
      const monthlySales = await getArtistMonthlySales(artist.id);

      // Calculate royalties from the performance tier + referral bonus
      const royaltyData = calculateRoyalty(profit, monthlySales, hasReferralBonus);
      
      if (hasReferralBonus) {
        console.log(`Referral bonus applied: +5% for artist ${artist.name}`);
      }

      // Calculate recruitment bonus if artist was recruited (5% of their base royalty goes to recruiter)
      const recruitmentData = await calculateRecruitmentBonus(artist.id, royaltyData.baseRoyalty);

      // Create order record with UTM tracking
      const order = await storage.createOrder({
        shopifyOrderId: shopifyOrder.id.toString(),
        artworkId: artwork.id,
        artistId: artist.id,
        productPrice: productPrice.toFixed(2),
        printifyCost: printifyCost.toFixed(2),
        shippingCost: shippingCost.toFixed(2),
        profit: profit.toFixed(2),
        utmSource: utmParams?.utmSource || null,
        utmMedium: utmParams?.utmMedium || null,
        utmCampaign: utmParams?.utmCampaign || null,
        referralArtistId: referralArtist?.id || null,
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
        recruitmentBonus: '0', // This sale doesn't earn recruitment bonus, it generates it for the recruiter
        totalEarnings: royaltyData.totalEarnings.toFixed(2),
      });
      
      // If artist was recruited, create a separate bonus sale for the recruiter
      if (recruitmentData.recruiterId) {
        const recruiterBonus = await storage.createSale({
          orderId: order.id,
          artistId: recruitmentData.recruiterId,
          artworkId: artwork.id,
          saleAmount: '0', // No direct sale, just bonus
          profit: '0',
          royaltyTier: 0,
          baseRoyalty: '0',
          referralBonus: '0',
          recruitmentBonus: recruitmentData.recruitmentBonus.toFixed(2),
          totalEarnings: recruitmentData.recruitmentBonus.toFixed(2),
        });
        
        console.log(`Recruitment bonus created: ${recruiterBonus.id}, Recruiter earns: $${recruiterBonus.totalEarnings}`);
      }

      console.log(`Sale recorded: ${sale.id}, Artist earns: $${sale.totalEarnings}`);

      // Update artwork's lastSaleDate to track activity for archive system
      await storage.updateArtworkLastSaleDate(artwork.id, new Date());
      console.log(`Updated lastSaleDate for artwork: ${artwork.id}`);

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
