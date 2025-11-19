import { db } from "./db";
import { upscaleUsage } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

export interface CachedUpscaleResult {
  found: boolean;
  upscaledUrl?: string;
  originalWidth?: number;
  originalHeight?: number;
  upscaledWidth?: number;
  upscaledHeight?: number;
  originalDpi?: number;
  cachedAt?: Date;
}

export class UpscaleDeduplicationService {
  
  static calculateFileHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  static async checkCache(fileHash: string): Promise<CachedUpscaleResult> {
    const cached = await db.query.upscaleUsage.findFirst({
      where: and(
        eq(upscaleUsage.fileHash, fileHash),
        eq(upscaleUsage.status, 'completed')
      ),
      orderBy: (upscaleUsage, { desc }) => [desc(upscaleUsage.createdAt)]
    });

    if (!cached || !cached.upscaledUrl) {
      return { found: false };
    }

    // Validate URL - only accept permanent object storage URLs
    // Temporary Replicate URLs (replicate.delivery) expire after 24 hours
    const isObjectStorageUrl = cached.upscaledUrl.includes('/objects/ai-generated/');
    const isReplicateUrl = cached.upscaledUrl.includes('replicate.delivery');
    
    if (isReplicateUrl && !isObjectStorageUrl) {
      console.log(`⚠️ Cache invalidated for hash ${fileHash} - expired temporary Replicate URL detected`);
      return { found: false };
    }

    return {
      found: true,
      upscaledUrl: cached.upscaledUrl,
      originalWidth: cached.originalWidth || undefined,
      originalHeight: cached.originalHeight || undefined,
      upscaledWidth: cached.upscaledWidth || undefined,
      upscaledHeight: cached.upscaledHeight || undefined,
      originalDpi: cached.originalDpi || undefined,
      cachedAt: cached.completedAt || cached.createdAt
    };
  }

  static async createPendingRecord(params: {
    fileHash: string;
    artistId: string;
    quotaType: 'registration_bonus' | 'monthly' | 'elite_unlimited';
    tier: string;
    ipAddress?: string;
    jobId?: string;
    replicateId?: string;
    originalUrl: string;
    originalWidth: number;
    originalHeight: number;
    upscaledWidth: number;
    upscaledHeight: number;
    originalDpi: number;
    costCents: number;
  }): Promise<void> {
    await db.insert(upscaleUsage).values({
      artistId: params.artistId,
      fileHash: params.fileHash,
      quotaType: params.quotaType,
      tier: params.tier,
      ipAddress: params.ipAddress,
      jobId: params.jobId,
      replicateId: params.replicateId,
      status: 'queued',
      originalUrl: params.originalUrl,
      originalWidth: params.originalWidth,
      originalHeight: params.originalHeight,
      upscaledWidth: params.upscaledWidth,
      upscaledHeight: params.upscaledHeight,
      originalDpi: params.originalDpi,
      costCents: params.costCents
    });
  }

  static async saveToCache(params: {
    fileHash: string;
    artistId: string;
    quotaType: 'registration_bonus' | 'monthly' | 'elite_unlimited';
    tier: string;
    ipAddress?: string;
    jobId?: string;
    replicateId?: string;
    originalUrl: string;
    upscaledUrl: string;
    originalWidth: number;
    originalHeight: number;
    upscaledWidth: number;
    upscaledHeight: number;
    originalDpi: number;
    costCents: number;
  }): Promise<void> {
    await db.insert(upscaleUsage).values({
      artistId: params.artistId,
      fileHash: params.fileHash,
      quotaType: params.quotaType,
      tier: params.tier,
      ipAddress: params.ipAddress,
      jobId: params.jobId,
      replicateId: params.replicateId,
      status: 'completed',
      originalUrl: params.originalUrl,
      upscaledUrl: params.upscaledUrl,
      originalWidth: params.originalWidth,
      originalHeight: params.originalHeight,
      upscaledWidth: params.upscaledWidth,
      upscaledHeight: params.upscaledHeight,
      originalDpi: params.originalDpi,
      costCents: params.costCents,
      completedAt: new Date()
    });
  }

  static async recordFailedAttempt(params: {
    fileHash: string;
    artistId: string;
    quotaType: 'registration_bonus' | 'monthly' | 'elite_unlimited';
    tier: string;
    ipAddress?: string;
    jobId?: string;
    replicateId?: string;
    originalUrl: string;
    errorMessage: string;
  }): Promise<void> {
    await db.insert(upscaleUsage).values({
      artistId: params.artistId,
      fileHash: params.fileHash,
      quotaType: params.quotaType,
      tier: params.tier,
      ipAddress: params.ipAddress,
      jobId: params.jobId,
      replicateId: params.replicateId,
      status: 'failed',
      originalUrl: params.originalUrl,
      errorMessage: params.errorMessage,
      costCents: 0,
      completedAt: new Date()
    });
  }

  static async getArtistUpscaleHistory(artistId: string, limit: number = 10): Promise<any[]> {
    return await db.query.upscaleUsage.findMany({
      where: eq(upscaleUsage.artistId, artistId),
      orderBy: (upscaleUsage, { desc }) => [desc(upscaleUsage.createdAt)],
      limit
    });
  }

  static async checkDailyIpLimit(ipAddress: string, maxPerDay: number = 50): Promise<{
    exceeded: boolean;
    count: number;
  }> {
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    const count = await db.select({ count: upscaleUsage.id })
      .from(upscaleUsage)
      .where(
        and(
          eq(upscaleUsage.ipAddress, ipAddress),
          eq(upscaleUsage.createdAt, twentyFourHoursAgo)
        )
      );

    const totalCount = count.length;

    return {
      exceeded: totalCount >= maxPerDay,
      count: totalCount
    };
  }
}
