import { storage } from "../storage";
import { parseDecimalToMinor } from "./money";
import { stripeConnectService } from "./stripe-connect";

interface PayoutCalculation {
  artistId: string;
  unpaidSales: any[];
  totalEarnings: number;
  baseRoyalties: number;
  referralBonuses: number;
  salesCount: number;
}

/**
 * NOTE ON WHAT USED TO BE HERE.
 *
 * This file previously owned two things it had no business owning:
 *
 * 1. `calculateRoyaltyTier()` — a second tier ladder keyed on the *number* of
 *    unpaid sales (1-10/11-25/26-50/51+), disagreeing with the amount-keyed
 *    ladder used when the sale was recorded. An artist's rate therefore
 *    depended on which function happened to ask.
 * 2. `calculateSaleRoyalty()` — a fallback that *recalculated* royalties at
 *    payout time from the current tier, silently overwriting what the
 *    contributor was told they had earned when the sale happened.
 *
 * Both are gone. Payout is now pure summation of what was recorded at event
 * time. A royalty is decided once, when the revenue event is recorded, and is
 * never recomputed — that is what makes a statement explainable and what makes
 * the ledger the authority instead of a cache.
 *
 * The single ladder now lives in `shared/financial-utils.ts` and is applied in
 * `server/lib/royalty.ts`.
 */

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

  // Sum what was recorded at event time. Amounts are summed in minor units so
  // repeated addition cannot drift; the legacy decimal columns are the fallback
  // for rows written before the minor-unit columns existed.
  let totalEarningsMinor = 0;
  let baseRoyaltiesMinor = 0;
  let referralBonusesMinor = 0;

  for (const sale of unpaidSales) {
    baseRoyaltiesMinor +=
      sale.baseRoyaltyMinor ?? parseDecimalToMinor(sale.baseRoyalty ?? "0");
    referralBonusesMinor +=
      sale.referralBonusMinor ?? parseDecimalToMinor(sale.referralBonus ?? "0");
    totalEarningsMinor +=
      sale.totalEarningsMinor ?? parseDecimalToMinor(sale.totalEarnings ?? "0");
  }

  return {
    artistId,
    unpaidSales,
    totalEarnings: totalEarningsMinor / 100,
    baseRoyalties: baseRoyaltiesMinor / 100,
    referralBonuses: referralBonusesMinor / 100,
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
