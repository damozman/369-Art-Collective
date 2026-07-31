/**
 * Shared Financial Utilities
 * Used by both scripts/financial-calculator.ts and server/lib/financial-service.ts
 * to ensure consistency and avoid duplication
 */

// ============================================
// ROYALTY TIER LADDER — single source of truth
// ============================================

/**
 * Royalty percentage by the artist's trailing monthly sales.
 *
 * This ladder is the only one. It previously existed in three places that did
 * not agree: this file named its rungs FREE/PRO/ELITE after subscription tiers
 * that no longer exist and omitted 40% entirely, `royalty-calculator.ts` keyed
 * on sales *amount*, and `payout-service.ts` keyed on sales *count* with
 * different thresholds. Amount-keyed won — a payout should not change because
 * an artist sold the same revenue across more, cheaper orders.
 *
 * Thresholds are in minor units, per the repo rule that money is never a float.
 */
export const ROYALTY_TIER_LADDER = [
  { minMonthlySalesMinor: 1_000_000, percent: 45 }, // $10,000+
  { minMonthlySalesMinor: 500_000, percent: 40 },   // $5,000–$9,999
  { minMonthlySalesMinor: 100_000, percent: 35 },   // $1,000–$4,999
  { minMonthlySalesMinor: 0, percent: 30 },         // $0–$999
] as const;

export const VALID_ROYALTY_PERCENTAGES = [30, 35, 40, 45] as const;

export type RoyaltyTier = typeof VALID_ROYALTY_PERCENTAGES[number];

/** Resolve the royalty rung for a given trailing monthly sales figure. */
export function royaltyPercentForMonthlySales(monthlySalesMinor: number): number {
  const rung = ROYALTY_TIER_LADDER.find(
    (t) => monthlySalesMinor >= t.minMonthlySalesMinor
  );
  return rung ? rung.percent : 30;
}

/**
 * Validate that royalty percentage is one of the allowed tiers.
 *
 * This used to reject 40 while the performance ladder happily produced it, so
 * any margin computed at the 40% rung threw. Both now read from the same list.
 */
export function isValidRoyaltyTier(percent: number): percent is RoyaltyTier {
  return VALID_ROYALTY_PERCENTAGES.includes(percent as RoyaltyTier);
}

/**
 * Clamp royalty to nearest valid tier
 */
export function clampToValidRoyaltyTier(percent: number): RoyaltyTier {
  const ascending = [...VALID_ROYALTY_PERCENTAGES].sort((a, b) => a - b);
  return ascending.find((t) => percent <= t) ?? ascending[ascending.length - 1];
}

// ============================================
// PAYMENT PROCESSING
// ============================================

/**
 * Payment processing cost, charged per transaction.
 *
 * Subtracted from net before royalties — previously nothing subtracted it,
 * which meant the platform absorbed the whole fee while paying the contributor
 * as though it did not exist.
 */
export const PAYMENT_PROCESSING = {
  percent: 2.9,
  /** Fixed per-transaction component, minor units. */
  fixedMinor: 30,
  currency: "USD",
} as const;

/** Referral bonus: +5% of net when a sale arrives via an artist's referral link. */
export const REFERRAL_BONUS_PERCENT = 5;

// ============================================
// PRINTIFY PRODUCT COSTS (2025 Data)
// ============================================
//
// REFERENCE ESTIMATES ONLY — for pricing and margin planning.
//
// These are static, undated, and unverified against the live catalog. They must
// never reach the payout path: costs that decide what a contributor is paid are
// resolved through `server/lib/cost-resolver.ts` and snapshotted onto the order
// at event time. A table like this one is exactly how the payout path came to
// run on invented numbers in the first place.

export interface ProductCost {
  name: string;
  printifyCost: number;  // Base production cost
  shipping: number;       // Average US shipping
  suggestedRetail: number; // Your retail price
}

export const PRINTIFY_PRODUCTS: Record<string, ProductCost> = {
  // Posters (Blueprint 852)
  'poster_small': { name: 'Poster 11x8"', printifyCost: 4.04, shipping: 6.29, suggestedRetail: 24.99 },
  'poster_medium': { name: 'Poster 18x24"', printifyCost: 5.50, shipping: 6.29, suggestedRetail: 34.99 },
  'poster_large': { name: 'Poster 24x36"', printifyCost: 6.29, shipping: 7.00, suggestedRetail: 44.99 },

  // Canvas Prints (Blueprint 555)
  'canvas_small': { name: 'Canvas 12x9"', printifyCost: 8.09, shipping: 7.00, suggestedRetail: 59.99 },
  'canvas_medium': { name: 'Canvas 16x20"', printifyCost: 12.00, shipping: 7.50, suggestedRetail: 89.99 },
  'canvas_large': { name: 'Canvas 24x32"', printifyCost: 18.00, shipping: 8.50, suggestedRetail: 129.99 },

  // Framed Prints (Blueprint 492)
  'framed_small': { name: 'Framed 12x16"', printifyCost: 15.00, shipping: 8.00, suggestedRetail: 79.99 },
  'framed_medium': { name: 'Framed 18x24"', printifyCost: 22.00, shipping: 9.00, suggestedRetail: 119.99 },
  'framed_large': { name: 'Framed 24x36"', printifyCost: 28.00, shipping: 10.00, suggestedRetail: 159.99 },

  // Metal Prints (Blueprint 1206)
  'metal_small': { name: 'Metal 12x16"', printifyCost: 25.00, shipping: 8.50, suggestedRetail: 99.99 },
  'metal_medium': { name: 'Metal 18x24"', printifyCost: 35.00, shipping: 9.00, suggestedRetail: 149.99 },
  'metal_large': { name: 'Metal 24x36"', printifyCost: 45.00, shipping: 10.00, suggestedRetail: 209.99 },
};

// ============================================
// MARGIN CALCULATION
// ============================================

export interface MarginCalculation {
  retailPrice: number;
  costs: {
    printify: number;
    shipping: number;
    artistRoyalty: number;
    paymentProcessing: number;
    total: number;
  };
  platformMargin: number;
  platformMarginPercent: number;
  breakdown: {
    printifyPercent: number;
    shippingPercent: number;
    artistPercent: number;
    paymentPercent: number;
    platformPercent: number;
  };
}

/**
 * Calculate margin for a specific product, at a given royalty rung.
 *
 * NOTE ON BASIS: this is a *pricing tool*, not the payout path. It applies the
 * royalty percentage to retail in order to answer "what margin is left at this
 * price point", which is a planning question. It is deliberately not the basis
 * used to pay anyone — `server/lib/royalty.ts` owns that, and applies the
 * percentage to net after costs. Do not reuse this function to compute an
 * amount owed to a contributor.
 */
export function calculateProductMargin(
  retailPrice: number,
  printifyCost: number,
  shipping: number,
  artistRoyaltyPercent: number,
  paymentProcessingPercent: number = PAYMENT_PROCESSING.percent
): MarginCalculation {
  // CRITICAL: Enforce royalty tier validation
  if (!isValidRoyaltyTier(artistRoyaltyPercent)) {
    throw new Error(
      `Invalid royalty percentage: ${artistRoyaltyPercent}%. Must be one of ${VALID_ROYALTY_PERCENTAGES.join(", ")}`
    );
  }

  const artistRoyalty = retailPrice * (artistRoyaltyPercent / 100);
  const paymentProcessing = retailPrice * (paymentProcessingPercent / 100);
  
  const totalCosts = printifyCost + shipping + artistRoyalty + paymentProcessing;
  const platformMargin = retailPrice - totalCosts;
  const platformMarginPercent = (platformMargin / retailPrice) * 100;

  return {
    retailPrice,
    costs: {
      printify: printifyCost,
      shipping,
      artistRoyalty,
      paymentProcessing,
      total: totalCosts,
    },
    platformMargin,
    platformMarginPercent,
    breakdown: {
      printifyPercent: (printifyCost / retailPrice) * 100,
      shippingPercent: (shipping / retailPrice) * 100,
      artistPercent: artistRoyaltyPercent,
      paymentPercent: paymentProcessingPercent,
      platformPercent: platformMarginPercent,
    },
  };
}
