import { db } from "./db";
import { artists, upscaleUsage } from "@shared/schema";
import { eq, and, gte, sql } from "drizzle-orm";

export interface QuotaStatus {
  hasQuota: boolean;
  remaining: number;
  total: number;
  quotaType: 'registration_bonus' | 'monthly';
  resetDate?: Date;
}

export class UpscaleQuotaService {

  // One allowance for every artist. Upscaling calls a paid third-party API
  // (Replicate), so the cap exists to bound cost, not to sell an upgrade.
  static readonly QUOTAS = {
    registrationBonus: 3,
    monthly: 5,
  };

  static async checkQuota(artistId: string): Promise<QuotaStatus> {
    const artist = await db.query.artists.findFirst({
      where: eq(artists.id, artistId)
    });

    if (!artist) {
      throw new Error("Artist not found");
    }

    const registrationUsed = artist.registrationUpscalesUsed || 0;
    const registrationRemaining = this.QUOTAS.registrationBonus - registrationUsed;

    if (registrationRemaining > 0) {
      return {
        hasQuota: true,
        remaining: registrationRemaining,
        total: this.QUOTAS.registrationBonus,
        quotaType: 'registration_bonus',
      };
    }

    const monthlyUsed = artist.monthlyUpscalesUsed || 0;
    const monthlyRemaining = this.QUOTAS.monthly - monthlyUsed;

    return {
      hasQuota: monthlyRemaining > 0,
      remaining: Math.max(0, monthlyRemaining),
      total: this.QUOTAS.monthly,
      quotaType: 'monthly',
      resetDate: this.calculateResetDate(artist.lastUpscaleResetAt),
    };
  }

  static async consumeQuota(
    artistId: string,
    quotaType: 'registration_bonus' | 'monthly'
  ): Promise<void> {
    const artist = await db.query.artists.findFirst({
      where: eq(artists.id, artistId)
    });

    if (!artist) {
      throw new Error("Artist not found");
    }

    if (quotaType === 'registration_bonus') {
      await db.update(artists)
        .set({
          registrationUpscalesUsed: (artist.registrationUpscalesUsed || 0) + 1
        })
        .where(eq(artists.id, artistId));
    } else if (quotaType === 'monthly') {
      await this.resetMonthlyQuotaIfNeeded(artistId, artist);
      
      await db.update(artists)
        .set({
          monthlyUpscalesUsed: (artist.monthlyUpscalesUsed || 0) + 1
        })
        .where(eq(artists.id, artistId));
    }

    await db.update(artists)
      .set({
        lifetimeUpscalesProcessed: (artist.lifetimeUpscalesProcessed || 0) + 1
      })
      .where(eq(artists.id, artistId));
  }

  static async resetMonthlyQuotaIfNeeded(artistId: string, artist?: any): Promise<void> {
    if (!artist) {
      const result = await db.query.artists.findFirst({
        where: eq(artists.id, artistId)
      });
      
      if (!result) {
        throw new Error("Artist not found");
      }
      
      artist = result;
    }

    const resetDate = this.calculateResetDate(artist.lastUpscaleResetAt);
    const now = new Date();

    if (now >= resetDate) {
      await db.update(artists)
        .set({
          monthlyUpscalesUsed: 0,
          lastUpscaleResetAt: now
        })
        .where(eq(artists.id, artistId));
    }
  }

  private static calculateResetDate(lastResetAt: Date | null): Date {
    const lastReset = lastResetAt ? new Date(lastResetAt) : new Date();
    const resetDate = new Date(lastReset);
    resetDate.setMonth(resetDate.getMonth() + 1);
    return resetDate;
  }

  static async trackCost(artistId: string, costCents: number): Promise<void> {
    await db.update(artists)
      .set({
        totalUpscaleCostCents: sql`${artists.totalUpscaleCostCents} + ${costCents}`
      })
      .where(eq(artists.id, artistId));
  }

  static async getUsageAnalytics(artistId: string): Promise<{
    lifetimeTotal: number;
    currentMonthUsed: number;
    totalCostCents: number;
    recentUpscales: any[];
  }> {
    const artist = await db.query.artists.findFirst({
      where: eq(artists.id, artistId)
    });

    if (!artist) {
      throw new Error("Artist not found");
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentUpscales = await db.query.upscaleUsage.findMany({
      where: and(
        eq(upscaleUsage.artistId, artistId),
        gte(upscaleUsage.createdAt, thirtyDaysAgo)
      ),
      orderBy: (upscaleUsage, { desc }) => [desc(upscaleUsage.createdAt)],
      limit: 10
    });

    return {
      lifetimeTotal: artist.lifetimeUpscalesProcessed || 0,
      currentMonthUsed: artist.monthlyUpscalesUsed || 0,
      totalCostCents: artist.totalUpscaleCostCents || 0,
      recentUpscales
    };
  }
}
