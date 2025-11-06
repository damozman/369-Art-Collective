/**
 * Royalty Calculator
 * Handles tiered royalty calculations based on artist performance
 */

import { storage } from "../storage";

/**
 * Royalty tier structure:
 * - Tier 1 (0-10 sales/month): 30%
 * - Tier 2 (11-25 sales/month): 35%
 * - Tier 3 (26-50 sales/month): 40%
 * - Tier 4 (51+ sales/month): 45%
 */
export function getRoyaltyTierPercentage(monthlySalesCount: number): number {
  if (monthlySalesCount >= 51) return 45;
  if (monthlySalesCount >= 26) return 40;
  if (monthlySalesCount >= 11) return 35;
  return 30; // 0-10 sales
}

/**
 * Get artist's current monthly sales count
 * MVP: Simple counter - can be enhanced later
 */
export async function getArtistMonthlySales(artistId: string): Promise<number> {
  // TODO: Query database for current month's sales
  // For MVP, return 0 (all artists start at 30% tier)
  return 0;
}

/**
 * Calculate royalty for a sale
 * @param profit - Net profit after Printify costs and shipping
 * @param monthlySalesCount - Artist's current monthly sales count
 * @param hasReferralBonus - Whether the sale came from artist's referral link (+5%)
 * @returns Royalty breakdown
 */
export function calculateRoyalty(
  profit: number,
  monthlySalesCount: number,
  hasReferralBonus: boolean = false
) {
  const tierPercentage = getRoyaltyTierPercentage(monthlySalesCount);
  const baseRoyalty = profit * (tierPercentage / 100);
  
  // Referral bonus: +5% of profit if sale came from artist's UTM link
  const referralBonus = hasReferralBonus ? profit * 0.05 : 0;
  
  const totalEarnings = baseRoyalty + referralBonus;

  return {
    royaltyTier: tierPercentage,
    baseRoyalty: Number(baseRoyalty.toFixed(2)),
    referralBonus: Number(referralBonus.toFixed(2)),
    totalEarnings: Number(totalEarnings.toFixed(2)),
  };
}

/**
 * Calculate recruitment bonus (5% of recruited artist's royalties)
 * MVP: DEFERRED - Return 0 for now, implement post-launch
 */
export async function calculateRecruitmentBonus(
  recruitedArtistId: string,
  saleAmount: number
): Promise<number> {
  // TODO: Implement recruitment bonus post-launch
  return 0;
}
