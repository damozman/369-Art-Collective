import { db } from "./db";
import { upscaleUsage, artists } from "@shared/schema";
import { eq, and, gte, sql, count } from "drizzle-orm";

export interface AbuseCheckResult {
  allowed: boolean;
  reason?: string;
  waitSeconds?: number;
}

export class UpscaleAbuseProtection {
  
  static readonly LIMITS = {
    perHourPerUser: 10,
    perDayPerIp: 50,
    perHourGlobal: 500,
    dailyBudgetCents: 1000,
    minAccountAgeMinutes: 5,
    maxFileSize: 25 * 1024 * 1024,
  };

  static async checkAllProtections(params: {
    artistId: string;
    ipAddress: string;
    fileSize: number;
    accountCreatedAt: Date;
  }): Promise<AbuseCheckResult> {
    const checks = [
      this.checkFileSize(params.fileSize),
      this.checkAccountAge(params.accountCreatedAt),
      await this.checkHourlyUserLimit(params.artistId),
      await this.checkDailyIpLimit(params.ipAddress),
      await this.checkGlobalHourlyLimit(),
      await this.checkDailyBudget(),
    ];

    for (const check of checks) {
      if (!check.allowed) {
        return check;
      }
    }

    return { allowed: true };
  }

  static checkFileSize(fileSize: number): AbuseCheckResult {
    if (fileSize > this.LIMITS.maxFileSize) {
      const sizeMB = Math.round(fileSize / 1024 / 1024);
      return {
        allowed: false,
        reason: `File size (${sizeMB}MB) exceeds maximum allowed size (25MB). Please compress your image before uploading.`
      };
    }
    
    return { allowed: true };
  }

  static checkAccountAge(createdAt: Date): AbuseCheckResult {
    const accountAgeMinutes = (Date.now() - createdAt.getTime()) / 1000 / 60;
    
    if (accountAgeMinutes < this.LIMITS.minAccountAgeMinutes) {
      const waitSeconds = Math.ceil((this.LIMITS.minAccountAgeMinutes - accountAgeMinutes) * 60);
      return {
        allowed: false,
        reason: "New accounts must wait 5 minutes before using upscaling. This helps us prevent abuse.",
        waitSeconds
      };
    }
    
    return { allowed: true };
  }

  static async checkHourlyUserLimit(artistId: string): Promise<AbuseCheckResult> {
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    const recentCount = await db.select({ count: sql<number>`count(*)` })
      .from(upscaleUsage)
      .where(
        and(
          eq(upscaleUsage.artistId, artistId),
          gte(upscaleUsage.createdAt, oneHourAgo)
        )
      );

    const total = recentCount[0]?.count || 0;

    if (total >= this.LIMITS.perHourPerUser) {
      return {
        allowed: false,
        reason: `You've reached the hourly limit of ${this.LIMITS.perHourPerUser} upscales. Please try again in an hour.`,
        waitSeconds: 3600
      };
    }

    return { allowed: true };
  }

  static async checkDailyIpLimit(ipAddress: string): Promise<AbuseCheckResult> {
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    const recentCount = await db.select({ count: sql<number>`count(*)` })
      .from(upscaleUsage)
      .where(
        and(
          eq(upscaleUsage.ipAddress, ipAddress),
          gte(upscaleUsage.createdAt, twentyFourHoursAgo)
        )
      );

    const total = recentCount[0]?.count || 0;

    if (total >= this.LIMITS.perDayPerIp) {
      return {
        allowed: false,
        reason: "Daily upscale limit reached from this IP address. Please try again tomorrow."
      };
    }

    return { allowed: true };
  }

  static async checkGlobalHourlyLimit(): Promise<AbuseCheckResult> {
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    const recentCount = await db.select({ count: sql<number>`count(*)` })
      .from(upscaleUsage)
      .where(gte(upscaleUsage.createdAt, oneHourAgo));

    const total = recentCount[0]?.count || 0;

    if (total >= this.LIMITS.perHourGlobal) {
      return {
        allowed: false,
        reason: "System is experiencing high demand. Please try again in a few minutes.",
        waitSeconds: 300
      };
    }

    return { allowed: true };
  }

  static async checkDailyBudget(): Promise<AbuseCheckResult> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dailyCost = await db.select({ 
      total: sql<number>`COALESCE(SUM(${upscaleUsage.costCents}), 0)` 
    })
      .from(upscaleUsage)
      .where(gte(upscaleUsage.createdAt, today));

    const totalCents = dailyCost[0]?.total || 0;

    if (totalCents >= this.LIMITS.dailyBudgetCents) {
      return {
        allowed: false,
        reason: "Daily upscaling budget reached. Service will resume tomorrow. Thank you for your patience!"
      };
    }

    return { allowed: true };
  }

  static async getAbuseMetrics(artistId: string): Promise<{
    hourlyCount: number;
    dailyCount: number;
    lifetimeCount: number;
    lastUpscaleAt?: Date;
  }> {
    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    const [hourly, daily, lifetime, recent] = await Promise.all([
      db.select({ count: sql<number>`count(*)` })
        .from(upscaleUsage)
        .where(
          and(
            eq(upscaleUsage.artistId, artistId),
            gte(upscaleUsage.createdAt, oneHourAgo)
          )
        ),
      db.select({ count: sql<number>`count(*)` })
        .from(upscaleUsage)
        .where(
          and(
            eq(upscaleUsage.artistId, artistId),
            gte(upscaleUsage.createdAt, twentyFourHoursAgo)
          )
        ),
      db.select({ count: sql<number>`count(*)` })
        .from(upscaleUsage)
        .where(eq(upscaleUsage.artistId, artistId)),
      db.query.upscaleUsage.findFirst({
        where: eq(upscaleUsage.artistId, artistId),
        orderBy: (upscaleUsage, { desc }) => [desc(upscaleUsage.createdAt)]
      })
    ]);

    return {
      hourlyCount: hourly[0]?.count || 0,
      dailyCount: daily[0]?.count || 0,
      lifetimeCount: lifetime[0]?.count || 0,
      lastUpscaleAt: recent?.createdAt
    };
  }
}
