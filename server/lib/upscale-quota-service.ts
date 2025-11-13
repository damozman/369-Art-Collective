import { db } from "./db";
import { artists, upscaleUsage } from "@shared/schema";
import { eq, and, gte, sql } from "drizzle-orm";

export interface QuotaStatus {
  tier: string;
  hasQuota: boolean;
  remaining: number;
  total: number;
  quotaType: 'registration_bonus' | 'monthly' | 'elite_unlimited';
  resetDate?: Date;
  upgradeRequired: boolean;
}

export class UpscaleQuotaService {
  
  static readonly QUOTAS = {
    free: {
      registrationBonus: 3,
      monthly: 5,
    },
    pro: {
      monthly: 25,
    },
    elite: {
      unlimited: true,
    }
  };

  static async checkQuota(artistId: string): Promise<QuotaStatus> {
    const artist = await db.query.artists.findFirst({
      where: eq(artists.id, artistId)
    });

    if (!artist) {
      throw new Error("Artist not found");
    }

    const tier = artist.subscriptionTier || 'free';

    if (tier === 'elite') {
      return {
        tier: 'elite',
        hasQuota: true,
        remaining: 999999,
        total: 999999,
        quotaType: 'elite_unlimited',
        upgradeRequired: false
      };
    }

    if (tier === 'free') {
      const registrationUsed = artist.registrationUpscalesUsed || 0;
      const registrationRemaining = this.QUOTAS.free.registrationBonus - registrationUsed;

      if (registrationRemaining > 0) {
        return {
          tier: 'free',
          hasQuota: true,
          remaining: registrationRemaining,
          total: this.QUOTAS.free.registrationBonus,
          quotaType: 'registration_bonus',
          upgradeRequired: false
        };
      }

      const monthlyUsed = artist.monthlyUpscalesUsed || 0;
      const monthlyRemaining = this.QUOTAS.free.monthly - monthlyUsed;
      const resetDate = this.calculateResetDate(artist.lastUpscaleResetAt);

      return {
        tier: 'free',
        hasQuota: monthlyRemaining > 0,
        remaining: Math.max(0, monthlyRemaining),
        total: this.QUOTAS.free.monthly,
        quotaType: 'monthly',
        resetDate,
        upgradeRequired: monthlyRemaining <= 0
      };
    }

    if (tier === 'pro') {
      const monthlyUsed = artist.monthlyUpscalesUsed || 0;
      const monthlyRemaining = this.QUOTAS.pro.monthly - monthlyUsed;
      const resetDate = this.calculateResetDate(artist.lastUpscaleResetAt);

      return {
        tier: 'pro',
        hasQuota: monthlyRemaining > 0,
        remaining: Math.max(0, monthlyRemaining),
        total: this.QUOTAS.pro.monthly,
        quotaType: 'monthly',
        resetDate,
        upgradeRequired: monthlyRemaining <= 0
      };
    }

    return {
      tier,
      hasQuota: false,
      remaining: 0,
      total: 0,
      quotaType: 'monthly',
      upgradeRequired: true
    };
  }

  static async consumeQuota(
    artistId: string,
    quotaType: 'registration_bonus' | 'monthly' | 'elite_unlimited'
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
