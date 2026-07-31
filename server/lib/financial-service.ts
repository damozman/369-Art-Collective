/**
 * Financial Service
 * Handles revenue tracking, margin calculations, and financial analytics
 * 
 * Uses shared/financial-utils.ts for consistency with scripts/financial-calculator.ts
 */

import { storage } from "../storage";
import { getCostResolver } from "./cost-resolver-factory";
import { CATALOG_MAP } from "./__fixtures__/printify-costs";
import {
  VALID_ROYALTY_PERCENTAGES,
  PRINTIFY_PRODUCTS,
  calculateProductMargin as sharedCalculateProductMargin,
  isValidRoyaltyTier,
  clampToValidRoyaltyTier,
  type MarginCalculation,
  type RoyaltyTier,
} from "@shared/financial-utils";

// Re-export shared utilities for convenience
export { VALID_ROYALTY_PERCENTAGES, isValidRoyaltyTier, clampToValidRoyaltyTier };
export type { MarginCalculation, RoyaltyTier };

// ============================================
// PRINTIFY PRODUCT COST MAPPING
// ============================================

/**
 * Live cost lookup for the admin cost panel.
 *
 * This used to be `getPrintifyProductCost`, which called the Printify API,
 * ignored the response entirely, and returned a hardcoded estimate — while
 * labelling the result `source: 'estimate'` in a UI that read like live data.
 *
 * It now goes through the same `CostResolver` the payout path uses, so the
 * panel shows what a sale would actually be costed at, and `source` reports
 * where the number genuinely came from.
 */
export async function getResolvedProductCosts(): Promise<
  Array<{
    finish: string;
    size: string;
    productionMinor: number;
    shippingMinor: number;
    currency: string;
    source: string;
    error?: string;
  }>
> {
  const resolver = getCostResolver();

  return Promise.all(
    CATALOG_MAP.map(async (entry) => {
      try {
        const cost = await resolver.resolveCost({
          blueprintId: entry.blueprintId,
          printProviderId: entry.printProviderId,
          variantId: entry.variantId,
          quantity: 1,
          destinationCountry: "US",
        });

        return {
          finish: entry.finish,
          size: entry.size,
          productionMinor: cost.productionMinor,
          shippingMinor: cost.shippingMinor,
          currency: cost.currency,
          source: cost.source,
        };
      } catch (error: any) {
        return {
          finish: entry.finish,
          size: entry.size,
          productionMinor: 0,
          shippingMinor: 0,
          currency: "USD",
          source: "unresolved",
          error: error?.message ?? "Cost resolution failed",
        };
      }
    })
  );
}

// ============================================
// REVENUE CALCULATION
// ============================================

/**
 * Revenue metrics.
 *
 * The CreatorStack, AI-credit, and membership-MRR streams that used to appear
 * here were removed with those products in Phase 0 steps 1–4. They survived as
 * hardcoded zeroes and placeholder projections, which type-checked fine and
 * reported confident numbers for businesses that no longer exist. Gone now.
 *
 * What remains is derived from the orders and sales tables rather than
 * asserted. Where a figure cannot yet be derived it is absent, not zero.
 */
export interface RevenueMetrics {
  artists: {
    activeCount: number;
  };
  productSales: {
    totalOrders: number;
    grossRevenueMinor: number;
    productionCostMinor: number;
    shippingCostMinor: number;
    processingFeeMinor: number;
    netMinor: number;
    artistRoyaltiesMinor: number;
    platformMarginMinor: number;
    averageOrderValueMinor: number;
  };
  /** Line items held because their costs could not be resolved. */
  needsReview: {
    orderCount: number;
    grossRevenueMinor: number;
  };
  currency: string;
}

/**
 * Revenue metrics, derived from recorded orders and sales.
 *
 * Every figure below is summed from snapshot columns written at event time.
 * Nothing is projected, estimated, or assumed — the previous version of this
 * function returned a structure full of hardcoded zeroes and called them
 * metrics.
 */
export async function calculateRevenueMetrics(
  startDate?: Date,
  endDate?: Date
): Promise<RevenueMetrics> {
  const allArtists = await storage.getAllArtists();
  const activeArtists = allArtists.filter(a => !a.deletedAt);

  const allOrders = await storage.getAllOrders();
  const inPeriod = allOrders.filter(o => {
    if (!startDate && !endDate) return true;
    const created = new Date(o.createdAt);
    if (startDate && created < startDate) return false;
    if (endDate && created > endDate) return false;
    return true;
  });

  const priced = inPeriod.filter(o => o.status !== "needs_review");
  const held = inPeriod.filter(o => o.status === "needs_review");

  const sum = (rows: any[], field: string) =>
    rows.reduce((total, row) => total + (row[field] ?? 0), 0);

  const grossRevenueMinor = sum(priced, "grossMinor");
  const productionCostMinor = sum(priced, "productionMinor");
  const shippingCostMinor = sum(priced, "shippingMinorAmount");
  const processingFeeMinor = sum(priced, "processingFeeMinor");
  const netMinor = sum(priced, "netMinor");

  // Royalties are read from the sales rows rather than recomputed — the amount
  // owed was decided when the sale was recorded and must not be re-derived.
  let artistRoyaltiesMinor = 0;
  for (const artist of activeArtists) {
    const sales = await storage.getSalesByArtist(artist.id);
    for (const sale of sales) {
      const created = new Date(sale.createdAt);
      if (startDate && created < startDate) continue;
      if (endDate && created > endDate) continue;
      artistRoyaltiesMinor += sale.totalEarningsMinor ?? 0;
    }
  }

  return {
    artists: {
      activeCount: activeArtists.length,
    },
    productSales: {
      totalOrders: priced.length,
      grossRevenueMinor,
      productionCostMinor,
      shippingCostMinor,
      processingFeeMinor,
      netMinor,
      artistRoyaltiesMinor,
      platformMarginMinor: netMinor - artistRoyaltiesMinor,
      averageOrderValueMinor:
        priced.length === 0 ? 0 : Math.round(grossRevenueMinor / priced.length),
    },
    needsReview: {
      orderCount: held.length,
      grossRevenueMinor: sum(held, "grossMinor"),
    },
    currency: "USD",
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
// PRICING STRATEGY TOOL
// ============================================

export interface PricingStrategy {
  productType: string;
  currentPrice: number;
  suggestedPrices: Array<{
    price: number;
    // Platform margin at each valid royalty rate (see VALID_ROYALTY_PERCENTAGES)
    margins: {
      rate30: MarginCalculation;
      rate35: MarginCalculation;
      rate45: MarginCalculation;
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
      rate30: calculateProductMargin(price, printifyCost, shipping, 30),
      rate35: calculateProductMargin(price, printifyCost, shipping, 35),
      rate45: calculateProductMargin(price, printifyCost, shipping, 45),
    },
  }));

  return {
    productType,
    currentPrice,
    suggestedPrices,
  };
}
