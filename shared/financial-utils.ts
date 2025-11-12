/**
 * Shared Financial Utilities
 * Used by both scripts/financial-calculator.ts and server/lib/financial-service.ts
 * to ensure consistency and avoid duplication
 */

// ============================================
// ROYALTY TIER CONSTANTS (from replit.md)
// ============================================

export const ROYALTY_TIERS = {
  FREE: 30,
  PRO: 35,
  ELITE: 45,
} as const;

export const VALID_ROYALTY_PERCENTAGES = [
  ROYALTY_TIERS.FREE,
  ROYALTY_TIERS.PRO,
  ROYALTY_TIERS.ELITE,
] as const;

export type RoyaltyTier = typeof VALID_ROYALTY_PERCENTAGES[number];

/**
 * Validate that royalty percentage is one of the allowed tiers
 */
export function isValidRoyaltyTier(percent: number): percent is RoyaltyTier {
  return VALID_ROYALTY_PERCENTAGES.includes(percent as RoyaltyTier);
}

/**
 * Clamp royalty to nearest valid tier
 */
export function clampToValidRoyaltyTier(percent: number): RoyaltyTier {
  if (percent <= ROYALTY_TIERS.FREE) return ROYALTY_TIERS.FREE;
  if (percent <= ROYALTY_TIERS.PRO) return ROYALTY_TIERS.PRO;
  return ROYALTY_TIERS.ELITE;
}

// ============================================
// PRINTIFY PRODUCT COSTS (2025 Data)
// ============================================

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
 * Calculate margin for a specific product
 * ENFORCES: artistRoyaltyPercent must be 30%, 35%, or 45% (replit.md policy)
 */
export function calculateProductMargin(
  retailPrice: number,
  printifyCost: number,
  shipping: number,
  artistRoyaltyPercent: number,
  paymentProcessingPercent: number = 3.0
): MarginCalculation {
  // CRITICAL: Enforce royalty tier validation
  if (!isValidRoyaltyTier(artistRoyaltyPercent)) {
    throw new Error(
      `Invalid royalty percentage: ${artistRoyaltyPercent}%. Must be 30%, 35%, or 45% per replit.md policy`
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
