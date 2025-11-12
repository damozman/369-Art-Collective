import { db } from "./db";
import { artists, subscriptionTrials } from "@shared/schema";
import { sql, and, gte, eq } from "drizzle-orm";

interface TrialSummaryMetrics {
  totalTrialsStarted: number;
  totalConverted: number;
  totalCanceled: number;
  totalExpired: number;
  conversionRate: number;
  trialGeneratedMRR: number;
  proTrials: number;
  eliteTrials: number;
  proConversions: number;
  eliteConversions: number;
  proConversionRate: number;
  eliteConversionRate: number;
}

interface TrialTrendData {
  date: string;
  trialsStarted: number;
  conversions: number;
  cancellations: number;
  expirations: number;
}

interface TrialFunnel {
  totalArtists: number;
  freeArtists: number;
  trialStarters: number;
  converted: number;
  freeToTrialRate: number;
  trialToConversionRate: number;
}

interface TrialBreakdown {
  tier: string;
  source: string;
  count: number;
  converted: number;
  conversionRate: number;
}

interface TrialAnalyticsResponse {
  summary: TrialSummaryMetrics;
  trend: TrialTrendData[];
  funnel: TrialFunnel;
  breakdowns: TrialBreakdown[];
}

/**
 * Calculate comprehensive trial analytics for admin dashboard
 * @param range Time range filter: '7d', '30d', '90d', or 'all'
 * @param tier Optional tier filter: 'pro', 'elite', or undefined for all
 */
export async function calculateTrialAnalytics(
  range: '7d' | '30d' | '90d' | 'all' = 'all',
  tier?: 'pro' | 'elite'
): Promise<TrialAnalyticsResponse> {
  // Calculate date cutoff for range filter
  const now = new Date();
  let cutoffDate: Date | null = null;
  if (range === '7d') {
    cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (range === '30d') {
    cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  } else if (range === '90d') {
    cutoffDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  }

  // Build WHERE conditions
  const conditions = [];
  if (cutoffDate) {
    conditions.push(gte(subscriptionTrials.trialStartedAt, cutoffDate));
  }
  if (tier) {
    conditions.push(eq(subscriptionTrials.tier, tier));
  }

  // ============================================
  // SUMMARY METRICS
  // ============================================
  const summaryResults = await db
    .select({
      tier: subscriptionTrials.tier,
      status: subscriptionTrials.status,
      count: sql<number>`count(*)::int`,
    })
    .from(subscriptionTrials)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(subscriptionTrials.tier, subscriptionTrials.status);

  // Aggregate summary metrics
  let totalTrialsStarted = 0;
  let totalConverted = 0;
  let totalCanceled = 0;
  let totalExpired = 0;
  let proTrials = 0;
  let eliteTrials = 0;
  let proConversions = 0;
  let eliteConversions = 0;

  summaryResults.forEach((row: any) => {
    const count = Number(row.count);
    totalTrialsStarted += count;

    if (row.tier === 'pro') {
      proTrials += count;
      if (row.status === 'converted') proConversions += count;
    } else if (row.tier === 'elite') {
      eliteTrials += count;
      if (row.status === 'converted') eliteConversions += count;
    }

    if (row.status === 'converted') totalConverted += count;
    if (row.status === 'canceled') totalCanceled += count;
    if (row.status === 'expired') totalExpired += count;
  });

  const conversionRate = totalTrialsStarted > 0 
    ? (totalConverted / totalTrialsStarted) * 100 
    : 0;
  
  const proConversionRate = proTrials > 0 
    ? (proConversions / proTrials) * 100 
    : 0;
  
  const eliteConversionRate = eliteTrials > 0 
    ? (eliteConversions / eliteTrials) * 100 
    : 0;

  // Calculate trial-generated MRR ($15 for Pro, $40 for Elite)
  const trialGeneratedMRR = (proConversions * 15) + (eliteConversions * 40);

  const summary: TrialSummaryMetrics = {
    totalTrialsStarted,
    totalConverted,
    totalCanceled,
    totalExpired,
    conversionRate,
    trialGeneratedMRR,
    proTrials,
    eliteTrials,
    proConversions,
    eliteConversions,
    proConversionRate,
    eliteConversionRate,
  };

  // ============================================
  // TREND DATA (time-series, only for ranged queries)
  // ============================================
  let trend: TrialTrendData[] = [];
  
  if (range !== 'all' && cutoffDate) {
    // Group by date for trend analysis
    const trendResults = await db
      .select({
        date: sql<string>`DATE(${subscriptionTrials.trialStartedAt})`,
        trialsStarted: sql<number>`count(*)::int`,
        conversions: sql<number>`count(case when ${subscriptionTrials.status} = 'converted' then 1 end)::int`,
        cancellations: sql<number>`count(case when ${subscriptionTrials.status} = 'canceled' then 1 end)::int`,
        expirations: sql<number>`count(case when ${subscriptionTrials.status} = 'expired' then 1 end)::int`,
      })
      .from(subscriptionTrials)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(sql`DATE(${subscriptionTrials.trialStartedAt})`)
      .orderBy(sql`DATE(${subscriptionTrials.trialStartedAt})`);

    trend = trendResults.map((row: any) => ({
      date: row.date,
      trialsStarted: Number(row.trialsStarted),
      conversions: Number(row.conversions),
      cancellations: Number(row.cancellations),
      expirations: Number(row.expirations),
    }));
  }

  // ============================================
  // FUNNEL METRICS
  // ============================================
  const totalArtists = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(artists)
    .where(eq(artists.approved, true));

  const freeArtists = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(artists)
    .where(
      and(
        eq(artists.approved, true),
        eq(artists.subscriptionTier, 'free')
      )
    );

  const funnel: TrialFunnel = {
    totalArtists: Number(totalArtists[0]?.count || 0),
    freeArtists: Number(freeArtists[0]?.count || 0),
    trialStarters: totalTrialsStarted,
    converted: totalConverted,
    freeToTrialRate: Number(freeArtists[0]?.count || 0) > 0 
      ? (totalTrialsStarted / Number(freeArtists[0]?.count)) * 100 
      : 0,
    trialToConversionRate: conversionRate,
  };

  // ============================================
  // BREAKDOWN BY TIER & SOURCE
  // ============================================
  const breakdownResults = await db
    .select({
      tier: subscriptionTrials.tier,
      source: subscriptionTrials.trialSource,
      count: sql<number>`count(*)::int`,
      converted: sql<number>`count(case when ${subscriptionTrials.status} = 'converted' then 1 end)::int`,
    })
    .from(subscriptionTrials)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(subscriptionTrials.tier, subscriptionTrials.trialSource);

  const breakdowns: TrialBreakdown[] = breakdownResults.map((row: any) => ({
    tier: row.tier,
    source: row.source || 'unknown',
    count: Number(row.count),
    converted: Number(row.converted),
    conversionRate: Number(row.count) > 0 
      ? (Number(row.converted) / Number(row.count)) * 100 
      : 0,
  }));

  return {
    summary,
    trend,
    funnel,
    breakdowns,
  };
}
