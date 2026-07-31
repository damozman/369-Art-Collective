import { storage } from "../storage";
import { stripeConnectService } from "./stripe-connect";
import { db } from "./db";
import { sales as salesTable } from "@shared/schema";
import { eq, isNull, and } from "drizzle-orm";

interface PayoutResult {
  totalPayouts: number;
  successfulPayouts: number;
  failedPayouts: number;
  totalAmount: number;
  payouts: Array<{
    artistId: string;
    artistName: string;
    amount: number;
    status: string;
    error?: string;
  }>;
}

/**
 * Process monthly payouts for all artists
 * Calculates unpaid earnings and processes Stripe transfers
 */
export async function processPayouts(): Promise<PayoutResult> {
  console.log("🔄 Starting payout processing...");

  const result: PayoutResult = {
    totalPayouts: 0,
    successfulPayouts: 0,
    failedPayouts: 0,
    totalAmount: 0,
    payouts: [],
  };

  try {
    // Get all artists
    const allArtists = await storage.getAllArtists();
    console.log(`Found ${allArtists.length} total artists`);

    // Filter artists with connected Stripe accounts
    const connectedArtists = allArtists.filter(
      (artist) => artist.stripeAccountId && artist.stripeAccountStatus === 'active'
    );
    console.log(`Found ${connectedArtists.length} artists with active Stripe accounts`);

    // Process each artist
    for (const artist of connectedArtists) {
      try {
        console.log(`\n💰 Processing payout for ${artist.name} (${artist.email})`);

        // Get unpaid sales for this artist (combine conditions with and())
        const unpaidSales = await db
          .select()
          .from(salesTable)
          .where(
            and(
              isNull(salesTable.payoutId),
              eq(salesTable.artistId, artist.id)
            )
          );

        if (unpaidSales.length === 0) {
          console.log(`  ℹ️  No unpaid sales for ${artist.name}`);
          continue;
        }

        // Calculate total earnings
        let totalAmount = 0;
        let baseRoyalties = 0;
        let referralBonuses = 0;

        unpaidSales.forEach((sale) => {
          totalAmount += parseFloat(sale.totalEarnings || '0');
          baseRoyalties += parseFloat(sale.baseRoyalty || '0');
          referralBonuses += parseFloat(sale.referralBonus || '0');
        });

        // Skip if amount is too small (less than $1)
        if (totalAmount < 1) {
          console.log(`  ℹ️  Amount too small ($${totalAmount.toFixed(2)}) - skipping`);
          continue;
        }

        console.log(`  💵 Total earnings: $${totalAmount.toFixed(2)}`);
        console.log(`     - Base royalties: $${baseRoyalties.toFixed(2)}`);
        console.log(`     - Referral bonuses: $${referralBonuses.toFixed(2)}`);

        // Determine period (first sale to last sale)
        const periodStart = new Date(unpaidSales[0].createdAt);
        const periodEnd = new Date(unpaidSales[unpaidSales.length - 1].createdAt);

        // Create payout record with pending status
        const payout = await storage.createPayout({
          artistId: artist.id,
          amount: totalAmount.toFixed(2),
          status: 'pending',
          periodStart,
          periodEnd,
          salesCount: unpaidSales.length,
          baseRoyalties: baseRoyalties.toFixed(2),
          referralBonuses: referralBonuses.toFixed(2),
        });

        console.log(`  ✅ Created payout record: ${payout.id}`);

        // Process Stripe transfer
        try {
          console.log(`  🔄 Processing Stripe transfer...`);

          const transferId = await stripeConnectService.processTransfer({
            connectedAccountId: artist.stripeAccountId!,
            amount: Math.round(totalAmount * 100), // Convert to cents
            description: `Artist payout for ${unpaidSales.length} sales (${periodStart.toLocaleDateString()} - ${periodEnd.toLocaleDateString()})`,
            metadata: {
              payoutId: payout.id,
              artistId: artist.id,
              salesCount: unpaidSales.length.toString(),
            },
          });

          console.log(`  ✅ Stripe transfer successful: ${transferId}`);

          // Update payout record with success
          await storage.updatePayout(payout.id, {
            status: 'completed',
            stripeTransferId: transferId,
            completedAt: new Date(),
          });

          // Link all sales to this payout
          for (const sale of unpaidSales) {
            await db
              .update(salesTable)
              .set({ payoutId: payout.id })
              .where(eq(salesTable.id, sale.id));
          }

          console.log(`  ✅ Payout completed for ${artist.name}: $${totalAmount.toFixed(2)}`);

          result.successfulPayouts++;
          result.totalAmount += totalAmount;
          result.payouts.push({
            artistId: artist.id,
            artistName: artist.name,
            amount: totalAmount,
            status: 'completed',
          });
        } catch (transferError: any) {
          console.error(`  ❌ Stripe transfer failed:`, transferError.message);

          // Update payout record with failure
          await storage.updatePayout(payout.id, {
            status: 'failed',
            failureReason: transferError.message,
          });

          result.failedPayouts++;
          result.payouts.push({
            artistId: artist.id,
            artistName: artist.name,
            amount: totalAmount,
            status: 'failed',
            error: transferError.message,
          });
        }

        result.totalPayouts++;
      } catch (artistError: any) {
        console.error(`❌ Error processing payout for ${artist.name}:`, artistError);
        result.failedPayouts++;
        result.payouts.push({
          artistId: artist.id,
          artistName: artist.name,
          amount: 0,
          status: 'failed',
          error: artistError.message,
        });
      }
    }

    console.log("\n✅ Payout processing complete!");
    console.log(`   Total payouts: ${result.totalPayouts}`);
    console.log(`   Successful: ${result.successfulPayouts}`);
    console.log(`   Failed: ${result.failedPayouts}`);
    console.log(`   Total amount: $${result.totalAmount.toFixed(2)}`);

    return result;
  } catch (error: any) {
    console.error("❌ Payout processing error:", error);
    throw error;
  }
}
