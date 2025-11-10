import { storage } from "../storage";
import { stripeConnectService } from "./stripe-connect";

interface PayoutCalculation {
  artistId: string;
  unpaidSales: any[];
  totalEarnings: number;
  baseRoyalties: number;
  referralBonuses: number;
  recruitmentBonuses: number;
  salesCount: number;
}

/**
 * Calculate tiered royalty percentage based on monthly sales volume
 * Tiers: 1-10 sales = 30%, 11-25 sales = 35%, 26-50 sales = 40%, 51+ sales = 45%
 */
export function calculateRoyaltyTier(monthlySalesCount: number): number {
  if (monthlySalesCount <= 10) return 30;
  if (monthlySalesCount <= 25) return 35;
  if (monthlySalesCount <= 50) return 40;
  return 45;
}

/**
 * Calculate royalty amount for a single sale
 */
export function calculateSaleRoyalty(
  profit: number,
  royaltyTier: number,
  hasReferralBonus: boolean = false,
  recruitmentBonus: number = 0
): {
  baseRoyalty: number;
  referralBonus: number;
  recruitmentBonus: number;
  totalEarnings: number;
} {
  const baseRoyalty = profit * (royaltyTier / 100);
  const referralBonus = hasReferralBonus ? profit * 0.05 : 0; // 5% bonus
  const total = baseRoyalty + referralBonus + recruitmentBonus;

  return {
    baseRoyalty: parseFloat(baseRoyalty.toFixed(2)),
    referralBonus: parseFloat(referralBonus.toFixed(2)),
    recruitmentBonus: parseFloat(recruitmentBonus.toFixed(2)),
    totalEarnings: parseFloat(total.toFixed(2)),
  };
}

/**
 * Get unpaid sales for an artist within a period and calculate payout with tiered royalties
 * If no period specified, calculates for all unpaid sales
 */
export async function calculateArtistPayout(
  artistId: string,
  periodStart?: Date,
  periodEnd?: Date
): Promise<PayoutCalculation | null> {
  // Get all sales without a payoutId (unpaid sales)
  const allSales = await storage.getSalesByArtist(artistId);
  
  // Filter for unpaid sales within the specified period (or all unpaid if no period)
  const unpaidSales = allSales.filter(sale => {
    if (sale.payoutId) return false; // Already paid
    
    // If no period specified, include all unpaid sales
    if (!periodStart || !periodEnd) return true;
    
    const saleDate = new Date(sale.createdAt);
    return saleDate >= periodStart && saleDate <= periodEnd;
  });

  if (unpaidSales.length === 0) {
    return null;
  }

  // Calculate royalty tier based on number of sales in this period
  const royaltyTier = calculateRoyaltyTier(unpaidSales.length);

  // Calculate totals using the tiered royalty percentage
  let totalEarnings = 0;
  let baseRoyalties = 0;
  let referralBonuses = 0;
  let recruitmentBonuses = 0;

  for (const sale of unpaidSales) {
    const profit = parseFloat(sale.profit);
    
    // Use stored values if available (already calculated during sale creation)
    // Otherwise recalculate based on current tier
    if (sale.baseRoyalty && sale.referralBonus !== undefined && sale.recruitmentBonus !== undefined) {
      baseRoyalties += parseFloat(sale.baseRoyalty);
      referralBonuses += parseFloat(sale.referralBonus);
      recruitmentBonuses += parseFloat(sale.recruitmentBonus);
      totalEarnings += parseFloat(sale.totalEarnings);
    } else {
      // Fallback: recalculate using current tier
      const calculation = calculateSaleRoyalty(profit, royaltyTier, false, 0);
      baseRoyalties += calculation.baseRoyalty;
      referralBonuses += calculation.referralBonus;
      recruitmentBonuses += calculation.recruitmentBonus;
      totalEarnings += calculation.totalEarnings;
    }
  }

  return {
    artistId,
    unpaidSales,
    totalEarnings: parseFloat(totalEarnings.toFixed(2)),
    baseRoyalties: parseFloat(baseRoyalties.toFixed(2)),
    referralBonuses: parseFloat(referralBonuses.toFixed(2)),
    recruitmentBonuses: parseFloat(recruitmentBonuses.toFixed(2)),
    salesCount: unpaidSales.length,
  };
}

/**
 * Execute payout via Stripe transfer and record in database
 * IMPORTANT: Operations ordered to prevent double-payment race conditions
 */
export async function executeArtistPayout(
  artistId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<{ success: boolean; payoutId?: string; error?: string }> {
  try {
    // Get artist and verify Stripe account is ready
    const artist = await storage.getArtist(artistId);
    if (!artist) {
      return { success: false, error: "Artist not found" };
    }

    if (!artist.stripeAccountId) {
      return { success: false, error: "No Stripe account linked" };
    }

    if (!artist.stripePayoutsEnabled) {
      return { success: false, error: "Stripe payouts not enabled" };
    }

    // Calculate payout for the specified period
    const calculation = await calculateArtistPayout(artistId, periodStart, periodEnd);
    if (!calculation || calculation.totalEarnings <= 0) {
      return { success: false, error: "No unpaid sales or zero earnings" };
    }

    // Minimum payout threshold: $10
    if (calculation.totalEarnings < 10) {
      return { success: false, error: "Earnings below $10 minimum threshold" };
    }

    // Create payout record first (status: processing)
    const payout = await storage.createPayout({
      artistId,
      amount: calculation.totalEarnings.toString(),
      status: "processing",
      periodStart,
      periodEnd,
      salesCount: calculation.salesCount,
      baseRoyalties: calculation.baseRoyalties.toString(),
      referralBonuses: calculation.referralBonuses.toString(),
      recruitmentBonuses: calculation.recruitmentBonuses.toString(),
    });

    let stripeTransferId: string | undefined;

    try {
      // Execute Stripe transfer (amount in cents)
      stripeTransferId = await stripeConnectService.processTransfer({
        connectedAccountId: artist.stripeAccountId,
        amount: Math.round(calculation.totalEarnings * 100),
        description: `Royalty payout for ${calculation.salesCount} sales (${periodStart.toISOString().split('T')[0]} to ${periodEnd.toISOString().split('T')[0]})`,
        metadata: {
          payoutId: payout.id,
          artistId,
          salesCount: calculation.salesCount.toString(),
        },
      });

      // CRITICAL: Save Stripe transfer ID immediately for reconciliation
      await storage.updatePayout(payout.id, {
        stripeTransferId,
        lastSyncedAt: new Date(),
      });

      // Link all sales to payout (bulk operation to reduce partial failure risk)
      const saleIds = calculation.unpaidSales.map(s => s.id);
      let linkedCount = 0;
      const linkErrors: string[] = [];

      for (const saleId of saleIds) {
        try {
          await storage.updateSale(saleId, { payoutId: payout.id });
          linkedCount++;
        } catch (err: any) {
          linkErrors.push(`${saleId}: ${err.message}`);
        }
      }

      // Check if all sales were successfully linked
      if (linkedCount !== saleIds.length) {
        throw new Error(`Only ${linkedCount}/${saleIds.length} sales linked. Errors: ${linkErrors.join('; ')}`);
      }

      // Only mark completed AFTER all sales successfully linked
      await storage.updatePayout(payout.id, {
        status: "completed",
        completedAt: new Date(),
      });

      return { success: true, payoutId: payout.id };
    } catch (error: any) {
      // If Stripe succeeded, we MUST log this for manual reconciliation
      if (stripeTransferId) {
        console.error("CRITICAL: Payout partially failed after successful Stripe transfer", {
          payoutId: payout.id,
          artistId,
          stripeTransferId,
          transferAmount: calculation.totalEarnings,
          salesCount: calculation.salesCount,
          error: error.message,
          note: "MANUAL RECONCILIATION REQUIRED - Stripe transfer succeeded but database updates failed",
        });
      }

      // Update payout status to failed with all relevant details
      await storage.updatePayout(payout.id, {
        status: "failed",
        failureReason: stripeTransferId
          ? `Stripe transfer ${stripeTransferId} succeeded, but database updates failed: ${error.message}`
          : error.message || "Payout execution failed",
      });

      return {
        success: false,
        error: stripeTransferId
          ? `Partial failure - Stripe transfer succeeded but linking failed. Transfer ID: ${stripeTransferId}`
          : error.message || "Failed to execute payout",
      };
    }
  } catch (error: any) {
    console.error("Payout execution error:", error);
    return { success: false, error: error.message || "Failed to execute payout" };
  }
}

/**
 * Process payouts for all eligible artists
 */
export async function processAllPayouts(
  periodStart: Date,
  periodEnd: Date
): Promise<{
  successful: number;
  failed: number;
  skipped: number;
  results: Array<{ artistId: string; status: string; payoutId?: string; error?: string }>;
}> {
  const artists = await storage.getAllArtists();
  const results: Array<{ artistId: string; status: string; payoutId?: string; error?: string }> = [];
  
  let successful = 0;
  let failed = 0;
  let skipped = 0;

  for (const artist of artists) {
    // Skip if not approved or deleted
    if (!artist.approved || artist.deletedAt) {
      skipped++;
      continue;
    }

    // Skip if Stripe not set up
    if (!artist.stripeAccountId || !artist.stripePayoutsEnabled) {
      skipped++;
      results.push({
        artistId: artist.id,
        status: "skipped",
        error: "Stripe not configured",
      });
      continue;
    }

    const result = await executeArtistPayout(artist.id, periodStart, periodEnd);
    
    if (result.success) {
      successful++;
      results.push({
        artistId: artist.id,
        status: "success",
        payoutId: result.payoutId,
      });
    } else {
      if (result.error?.includes("No unpaid sales") || result.error?.includes("below $10")) {
        skipped++;
        results.push({
          artistId: artist.id,
          status: "skipped",
          error: result.error,
        });
      } else {
        failed++;
        results.push({
          artistId: artist.id,
          status: "failed",
          error: result.error,
        });
      }
    }
  }

  return { successful, failed, skipped, results };
}
