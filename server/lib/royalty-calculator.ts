/**
 * Royalty Calculator
 * Handles tiered royalty calculations based on artist performance AND subscription tier
 */

import { storage } from "../storage";

/**
 * Performance-based royalty tier structure (based on monthly sales AMOUNT):
 * - Tier 1 ($0-$999): 30%
 * - Tier 2 ($1000-$4999): 35%
 * - Tier 3 ($5000-$9999): 40%
 * - Tier 4 ($10,000+): 45%
 */
export function getPerformanceRoyaltyPercentage(monthlySalesAmount: number): number {
  if (monthlySalesAmount >= 10000) return 45;
  if (monthlySalesAmount >= 5000) return 40;
  if (monthlySalesAmount >= 1000) return 35;
  return 30; // $0-$999
}

/**
 * Subscription tier royalty minimums:
 * - Free: 30% (performance-based only)
 * - Pro: 35% guaranteed minimum
 * - Elite: 45% guaranteed (max tier immediately)
 */
export function getSubscriptionRoyaltyPercentage(subscriptionTier: string): number {
  if (subscriptionTier === 'elite') return 45;
  if (subscriptionTier === 'pro') return 35;
  return 30; // free tier
}

/**
 * Calculate final royalty percentage using Math.max of performance and subscription tiers
 * This ensures artists always get the BEST rate between:
 * 1. Their performance-based tier (grows with sales)
 * 2. Their subscription tier minimum (guaranteed based on plan)
 */
export function getRoyaltyTierPercentage(
  monthlySalesAmount: number,
  subscriptionTier: string = 'free'
): number {
  const performanceRate = getPerformanceRoyaltyPercentage(monthlySalesAmount);
  const subscriptionRate = getSubscriptionRoyaltyPercentage(subscriptionTier);
  
  // Return whichever is higher
  return Math.max(performanceRate, subscriptionRate);
}

/**
 * Get artist's current monthly sales amount (in dollars)
 * Reads from artist.monthly_sales column (updated periodically)
 */
export async function getArtistMonthlySales(artistId: string): Promise<number> {
  const artist = await storage.getArtist(artistId);
  if (!artist || !artist.monthlySales) return 0;
  return parseFloat(artist.monthlySales.toString());
}

/**
 * Calculate royalty for a sale
 * @param profit - Net profit after Printify costs and shipping
 * @param monthlySalesAmount - Artist's current monthly sales amount (in dollars)
 * @param subscriptionTier - Artist's subscription tier (free, pro, elite)
 * @param hasReferralBonus - Whether the sale came from artist's referral link (+5%)
 * @returns Royalty breakdown
 */
export function calculateRoyalty(
  profit: number,
  monthlySalesAmount: number,
  subscriptionTier: string = 'free',
  hasReferralBonus: boolean = false
) {
  const tierPercentage = getRoyaltyTierPercentage(monthlySalesAmount, subscriptionTier);
  const baseRoyalty = profit * (tierPercentage / 100);
  
  // Referral bonus: +5% of profit if sale came from artist's referral link
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
 * Calculate recruitment bonus (5% of recruited artist's base royalty)
 * When an artist recruits another artist, they earn 5% of that artist's base royalty on every sale
 * 
 * @param recruitedArtistId - The artist who made the sale
 * @param baseRoyalty - The base royalty amount the recruited artist earned
 * @returns Bonus amount for the recruiter (5% of base royalty)
 */
export async function calculateRecruitmentBonus(
  recruitedArtistId: string,
  baseRoyalty: number
): Promise<{
  recruitmentBonus: number;
  recruiterId: string | null;
}> {
  // Check if this artist was recruited by someone
  const recruitedArtist = await storage.getArtist(recruitedArtistId);
  
  if (!recruitedArtist || !recruitedArtist.referredBy) {
    return {
      recruitmentBonus: 0,
      recruiterId: null,
    };
  }
  
  // Calculate 5% of the recruited artist's base royalty
  const recruitmentBonus = baseRoyalty * 0.05;
  
  console.log(`Recruitment bonus: Artist ${recruitedArtist.referredBy} earns $${recruitmentBonus.toFixed(2)} from recruiting ${recruitedArtistId}`);
  
  return {
    recruitmentBonus: Number(recruitmentBonus.toFixed(2)),
    recruiterId: recruitedArtist.referredBy,
  };
}
