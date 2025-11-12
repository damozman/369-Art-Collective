/**
 * Financial Service
 * Handles revenue tracking, margin calculations, and financial analytics
 * 
 * Uses shared/financial-utils.ts for consistency with scripts/financial-calculator.ts
 */

import { storage } from "../storage";
import { getBlueprint } from "./printify";
import {
  ROYALTY_TIERS,
  VALID_ROYALTY_PERCENTAGES,
  PRINTIFY_PRODUCTS,
  calculateProductMargin as sharedCalculateProductMargin,
  isValidRoyaltyTier,
  clampToValidRoyaltyTier,
  type MarginCalculation,
  type RoyaltyTier,
} from "@shared/financial-utils";

// Re-export shared utilities for convenience
export { ROYALTY_TIERS, VALID_ROYALTY_PERCENTAGES, isValidRoyaltyTier, clampToValidRoyaltyTier };
export type { MarginCalculation, RoyaltyTier };

// ============================================
// PRINTIFY PRODUCT COST MAPPING
// ============================================

interface ProductCostData {
  blueprintId: number;
  name: string;
  estimatedCost: number;
  estimatedShipping: number;
}

// Blueprint IDs for wall art products (based on replit.md)
export const WALL_ART_BLUEPRINTS = {
  POSTER: 852,
  CANVAS: 555,
  FRAMED: 492,
  METAL: 1206,
};

// Estimated costs by size (fallback if API unavailable)
// These match PRINTIFY_PRODUCTS from shared/financial-utils.ts
const ESTIMATED_COSTS: Record<string, ProductCostData[]> = {
  poster: [
    { blueprintId: 852, name: '11x8"', estimatedCost: 4.04, estimatedShipping: 6.29 },
    { blueprintId: 852, name: '18x24"', estimatedCost: 5.50, estimatedShipping: 6.29 },
    { blueprintId: 852, name: '24x36"', estimatedCost: 6.29, estimatedShipping: 7.00 },
  ],
  canvas: [
    { blueprintId: 555, name: '12x9"', estimatedCost: 8.09, estimatedShipping: 7.00 },
    { blueprintId: 555, name: '16x20"', estimatedCost: 12.00, estimatedShipping: 7.50 },
    { blueprintId: 555, name: '24x32"', estimatedCost: 18.00, estimatedShipping: 8.50 },
  ],
  framed: [
    { blueprintId: 492, name: '12x16"', estimatedCost: 15.00, estimatedShipping: 8.00 },
    { blueprintId: 492, name: '18x24"', estimatedCost: 22.00, estimatedShipping: 9.00 },
    { blueprintId: 492, name: '24x36"', estimatedCost: 28.00, estimatedShipping: 10.00 },
  ],
  metal: [
    { blueprintId: 1206, name: '12x16"', estimatedCost: 25.00, estimatedShipping: 8.50 },
    { blueprintId: 1206, name: '18x24"', estimatedCost: 35.00, estimatedShipping: 9.00 },
    { blueprintId: 1206, name: '24x36"', estimatedCost: 45.00, estimatedShipping: 10.00 },
  ],
};

/**
 * Fetch live Printify costs for a product (or use estimates)
 */
export async function getPrintifyProductCost(
  blueprintId: number,
  variantId?: number
): Promise<{ cost: number; shipping: number; source: 'api' | 'estimate' }> {
  try {
    // Try to fetch from Printify API
    const blueprint = await getBlueprint(blueprintId);
    
    // For now, return estimates since live API pricing requires print provider context
    // In production, you'd parse the blueprint variants to get exact costs
    const productType = Object.entries(WALL_ART_BLUEPRINTS).find(
      ([_, id]) => id === blueprintId
    )?.[0]?.toLowerCase();

    if (productType && ESTIMATED_COSTS[productType]) {
      const estimate = ESTIMATED_COSTS[productType][1]; // Use medium size as default
      return {
        cost: estimate.estimatedCost,
        shipping: estimate.estimatedShipping,
        source: 'estimate',
      };
    }

    return { cost: 15, shipping: 8, source: 'estimate' };
  } catch (error) {
    console.error('[ERROR] Failed to fetch Printify costs:', error);
    return { cost: 15, shipping: 8, source: 'estimate' };
  }
}

// ============================================
// REVENUE CALCULATION
// ============================================

export interface RevenueMetrics {
  // Print Network
  printNetwork: {
    artistSubscriptions: {
      freeCount: number;
      proCount: number;
      eliteCount: number;
      monthlyMRR: number;
      annualProjection: number;
    };
    productSales: {
      totalOrders: number;
      totalRevenue: number;
      averageOrderValue: number;
      platformMargin: number;
      artistRoyalties: number;
    };
    aiCredits: {
      totalPurchases: number;
      revenue: number;
    };
  };
  
  // CreatorStack
  creatorStack: {
    kitSales: {
      totalSales: number;
      revenue: number;
    };
    proMemberships: {
      activeMembers: number;
      monthlyMRR: number;
      annualProjection: number;
    };
  };

  // Totals
  totals: {
    totalMRR: number;
    totalAnnualRecurring: number;
    totalOneTimeRevenue: number;
    totalMonthlyRevenue: number;
  };
}

/**
 * Calculate comprehensive revenue metrics across all streams
 */
export async function calculateRevenueMetrics(
  startDate?: Date,
  endDate?: Date
): Promise<RevenueMetrics> {
  const now = new Date();
  const monthStart = startDate || new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = endDate || new Date(now.getFullYear(), now.getMonth() + 1, 0);

  // Get all artists with subscription data
  const allArtists = await storage.getAllArtists();
  
  const freeArtists = allArtists.filter(a => a.subscriptionTier === 'free' && !a.deletedAt);
  const proArtists = allArtists.filter(a => a.subscriptionTier === 'pro' && !a.deletedAt);
  const eliteArtists = allArtists.filter(a => a.subscriptionTier === 'elite' && !a.deletedAt);

  // Artist subscription MRR (based on replit.md pricing)
  const proPrice = 20; // $20/mo for Pro
  const elitePrice = 45; // $45/mo for Elite
  const artistSubscriptionMRR = (proArtists.length * proPrice) + (eliteArtists.length * elitePrice);

  // Get product sales data (from orders table if available, or calculate)
  // For now, we'll use estimated data - in production, query actual orders
  const productSales = {
    totalOrders: 0,
    totalRevenue: 0,
    averageOrderValue: 0,
    platformMargin: 0,
    artistRoyalties: 0,
  };

  // AI credit purchases - query from database
  const aiCredits = {
    totalPurchases: 0,
    revenue: 0,
  };

  // CreatorStack data (would come from buyer purchases table)
  const creatorStack = {
    kitSales: {
      totalSales: 0,
      revenue: 0,
    },
    proMemberships: {
      activeMembers: 0,
      monthlyMRR: 0,
      annualProjection: 0,
    },
  };

  // Calculate totals
  const totalMRR = artistSubscriptionMRR + creatorStack.proMemberships.monthlyMRR;
  const totalOneTimeRevenue = productSales.platformMargin + aiCredits.revenue + creatorStack.kitSales.revenue;

  return {
    printNetwork: {
      artistSubscriptions: {
        freeCount: freeArtists.length,
        proCount: proArtists.length,
        eliteCount: eliteArtists.length,
        monthlyMRR: artistSubscriptionMRR,
        annualProjection: artistSubscriptionMRR * 12,
      },
      productSales,
      aiCredits,
    },
    creatorStack,
    totals: {
      totalMRR,
      totalAnnualRecurring: totalMRR * 12,
      totalOneTimeRevenue,
      totalMonthlyRevenue: totalMRR + totalOneTimeRevenue,
    },
  };
}

// ============================================
// MARGIN CALCULATOR
// ============================================

/**
 * Calculate margin for a specific product at given price and royalty
 * ENFORCES: artistRoyaltyPercent must be 30%, 35%, or 45% (replit.md policy)
 * 
 * Uses shared calculateProductMargin from @shared/financial-utils.ts
 */
export function calculateProductMargin(
  retailPrice: number,
  printifyCost: number,
  shipping: number,
  artistRoyaltyPercent: number,
  paymentProcessingPercent: number = 3.0
): MarginCalculation {
  // Use the shared implementation which includes validation
  return sharedCalculateProductMargin(
    retailPrice,
    printifyCost,
    shipping,
    artistRoyaltyPercent,
    paymentProcessingPercent
  );
}

// ============================================
// ARTIST BREAK-EVEN CALCULATOR
// ============================================

export interface ArtistBreakEven {
  subscriptionCost: number;
  subscriptionTier: 'free' | 'pro' | 'elite';
  royaltyPercent: number;
  averageProductRevenue: number; // Average $ they earn per sale
  salesNeededToBreakEven: number;
  monthlyROI: {
    breakEvenSales: number;
    benefits: string[];
  };
}

/**
 * Calculate how many sales an artist needs to break even on subscription
 */
export function calculateArtistBreakEven(
  subscriptionTier: 'free' | 'pro' | 'elite',
  averageOrderValue: number = 89.99
): ArtistBreakEven {
  const tierData = {
    free: { cost: 0, royalty: 30, benefits: ['30% royalty', '20 artwork limit', 'Basic features'] },
    pro: { cost: 20, royalty: 35, benefits: ['35% royalty', 'Unlimited artworks', '50 AI credits/month', 'Featured rotation eligibility'] },
    elite: { cost: 45, royalty: 45, benefits: ['45% royalty', 'Unlimited artworks', 'Unlimited AI credits', 'Guaranteed featured placement', 'Priority support'] },
  };

  const tier = tierData[subscriptionTier];
  const averageProductRevenue = averageOrderValue * (tier.royalty / 100);
  const salesNeededToBreakEven = tier.cost > 0 ? Math.ceil(tier.cost / averageProductRevenue) : 0;

  return {
    subscriptionCost: tier.cost,
    subscriptionTier,
    royaltyPercent: tier.royalty,
    averageProductRevenue,
    salesNeededToBreakEven,
    monthlyROI: {
      breakEvenSales: salesNeededToBreakEven,
      benefits: tier.benefits,
    },
  };
}

// ============================================
// PRICING STRATEGY TOOL
// ============================================

export interface PricingStrategy {
  productType: string;
  currentPrice: number;
  suggestedPrices: Array<{
    price: number;
    margins: {
      free: MarginCalculation;
      pro: MarginCalculation;
      elite: MarginCalculation;
    };
  }>;
}

/**
 * Generate pricing strategy recommendations
 */
export async function generatePricingStrategy(
  productType: 'poster' | 'canvas' | 'framed' | 'metal',
  currentPrice: number,
  printifyCost: number,
  shipping: number
): Promise<PricingStrategy> {
  // Test pricing at -10%, current, +10%, +20%
  const pricePoints = [
    currentPrice * 0.9,
    currentPrice,
    currentPrice * 1.1,
    currentPrice * 1.2,
  ];

  const suggestedPrices = pricePoints.map(price => ({
    price: Math.round(price * 100) / 100, // Round to 2 decimals
    margins: {
      free: calculateProductMargin(price, printifyCost, shipping, 30),
      pro: calculateProductMargin(price, printifyCost, shipping, 35),
      elite: calculateProductMargin(price, printifyCost, shipping, 45),
    },
  }));

  return {
    productType,
    currentPrice,
    suggestedPrices,
  };
}
