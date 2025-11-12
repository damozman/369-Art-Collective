import { db } from "./db";
import { artists, artworks } from "@shared/schema";
import { eq, and, desc, or, isNull, gte, sql } from "drizzle-orm";

/**
 * Featured Artists Service
 * 
 * Hybrid Performance + Fair Rotation System
 * Manages homepage featured artists with a balanced approach:
 * 
 * SLOT ALLOCATION:
 * - Slots 1-2: Performance-based (top sellers by tier + sales)
 * - Slots 3-4: Fair rotation (all eligible artists get turns)
 * 
 * BUSINESS RULES:
 * - Elite members: Auto-eligible (priority 100) + guaranteed rotation time
 * - Pro members: Eligible (priority 50) + fair rotation
 * - Free members: Manual admin approval only (priority 0-25)
 * - Pinned artists: Guaranteed featured until featuredPinnedUntil date
 * 
 * ROTATION LOGIC:
 * - Performance slots reward top earners (motivation)
 * - Rotation slots ensure fairness (all paying members get exposure)
 * - lastFeaturedAt tracks rotation to prevent repeats
 */

export interface FeaturedArtist {
  id: string;
  name: string;
  bio: string | null;
  profilePhoto: string | null;
  subscriptionTier: string;
  artworkCount: number;
  monthlySales: string;
  specialty?: string;
}

/**
 * Get featured artists for homepage display
 * Hybrid system: Performance slots (1-2) + Rotation slots (3-4)
 */
export async function getFeaturedArtists(limit: number = 4): Promise<FeaturedArtist[]> {
  const now = new Date();
  
  // Calculate slot allocation based on limit
  const performanceSlots = Math.ceil(limit / 2); // Half for top performers
  const rotationSlots = Math.floor(limit / 2);   // Half for fair rotation
  
  // Get all eligible artists
  const eligibleArtists = await db
    .select({
      id: artists.id,
      name: artists.name,
      bio: artists.bio,
      profilePhoto: artists.profilePhoto,
      subscriptionTier: artists.subscriptionTier,
      monthlySales: artists.monthlySales,
      featuredPriority: artists.featuredPriority,
      lastFeaturedAt: artists.lastFeaturedAt,
    })
    .from(artists)
    .where(
      and(
        eq(artists.approved, true),
        isNull(artists.deletedAt),
        or(
          eq(artists.isFeaturedEligible, true),
          gte(artists.featuredPinnedUntil, now)
        )
      )
    )
    .execute();

  if (eligibleArtists.length === 0) {
    return [];
  }

  // SLOT 1-2: Performance-based (top sellers by tier + sales)
  const performanceArtists = [...eligibleArtists]
    .sort((a, b) => {
      // First by priority (Elite=100 > Pro=50 > Free=0-25)
      if (a.featuredPriority !== b.featuredPriority) {
        return b.featuredPriority - a.featuredPriority;
      }
      // Then by monthly sales
      return Number(b.monthlySales) - Number(a.monthlySales);
    })
    .slice(0, performanceSlots);

  // SLOT 3-4: Fair rotation (oldest lastFeaturedAt first)
  const rotationArtists = [...eligibleArtists]
    .filter(a => !performanceArtists.find(p => p.id === a.id)) // Exclude performance artists
    .sort((a, b) => {
      // Artists never featured go first (null lastFeaturedAt)
      if (!a.lastFeaturedAt && !b.lastFeaturedAt) {
        // Both never featured: sort by tier then sales
        if (a.featuredPriority !== b.featuredPriority) {
          return b.featuredPriority - a.featuredPriority;
        }
        return Number(b.monthlySales) - Number(a.monthlySales);
      }
      if (!a.lastFeaturedAt) return -1; // Never featured goes first
      if (!b.lastFeaturedAt) return 1;
      
      // Both have been featured: oldest goes first
      return a.lastFeaturedAt.getTime() - b.lastFeaturedAt.getTime();
    })
    .slice(0, rotationSlots);

  // Combine performance + rotation artists
  const selectedArtists = [...performanceArtists, ...rotationArtists];

  // Enrich with artwork counts and specialty
  const enrichedArtists = await Promise.all(
    selectedArtists.map(async (artist) => {
      const artworkCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(artworks)
        .where(
          and(
            eq(artworks.artistId, artist.id),
            eq(artworks.status, "approved")
          )
        )
        .execute();

      // Determine specialty based on tier
      let specialty = "Featured Artist";
      if (artist.subscriptionTier === "elite") {
        specialty = "Elite Creator";
      } else if (artist.subscriptionTier === "pro") {
        specialty = "Pro Artist";
      } else if (artist.bio) {
        const bioSnippet = artist.bio.split(".")[0].substring(0, 50);
        if (bioSnippet.length > 10) {
          specialty = bioSnippet;
        }
      }

      return {
        id: artist.id,
        name: artist.name,
        bio: artist.bio,
        profilePhoto: artist.profilePhoto,
        subscriptionTier: artist.subscriptionTier,
        artworkCount: Number(artworkCount[0]?.count || 0),
        monthlySales: artist.monthlySales,
        specialty,
      };
    })
  );

  // Update lastFeaturedAt for rotation tracking
  await trackFeaturedDisplay(selectedArtists.map(a => a.id));

  return enrichedArtists;
}

/**
 * Update featured eligibility when subscription tier changes
 * Called by subscription service on tier upgrades/downgrades
 */
export async function updateFeaturedStatusForTier(
  artistId: string,
  newTier: string
): Promise<void> {
  let priority = 0;
  let eligible = false;

  switch (newTier) {
    case "elite":
      priority = 100;
      eligible = true;
      console.log(`[Featured] Elite member ${artistId} auto-featured (priority: 100)`);
      break;
    case "pro":
      priority = 50;
      eligible = true;
      console.log(`[Featured] Pro member ${artistId} eligible (priority: 50)`);
      break;
    case "free":
      priority = 0;
      eligible = false;
      console.log(`[Featured] Free member ${artistId} not auto-eligible (priority: 0)`);
      break;
  }

  // When downgrading to free tier, clear any pinned status
  // unless admin explicitly wants to keep them pinned
  const updateData: {
    featuredPriority: number;
    isFeaturedEligible: boolean;
    featuredPinnedUntil?: Date | null;
  } = {
    featuredPriority: priority,
    isFeaturedEligible: eligible,
  };
  
  if (newTier === "free") {
    updateData.featuredPinnedUntil = null;
  }

  await db
    .update(artists)
    .set(updateData)
    .where(eq(artists.id, artistId))
    .execute();
}

/**
 * Manually pin an artist to featured section until a specific date
 * Used by admins for campaigns, promotions, or highlighting new artists
 */
export async function pinArtistToFeatured(
  artistId: string,
  untilDate: Date,
  priorityBoost: number = 0
): Promise<void> {
  const artist = await db
    .select()
    .from(artists)
    .where(eq(artists.id, artistId))
    .limit(1)
    .execute();

  if (!artist[0]) {
    throw new Error("Artist not found");
  }

  const newPriority = artist[0].featuredPriority + priorityBoost;

  await db
    .update(artists)
    .set({
      featuredPinnedUntil: untilDate,
      featuredPriority: newPriority,
      isFeaturedEligible: true,
    })
    .where(eq(artists.id, artistId))
    .execute();

  console.log(`[Featured] Pinned artist ${artistId} until ${untilDate.toISOString()} (priority: ${newPriority})`);
}

/**
 * Remove featured pin from an artist
 * Resets to tier-based defaults
 */
export async function unpinArtist(artistId: string): Promise<void> {
  const artist = await db
    .select()
    .from(artists)
    .where(eq(artists.id, artistId))
    .limit(1)
    .execute();

  if (!artist[0]) {
    throw new Error("Artist not found");
  }

  // Reset to tier-based defaults
  await updateFeaturedStatusForTier(artistId, artist[0].subscriptionTier);

  await db
    .update(artists)
    .set({
      featuredPinnedUntil: null,
    })
    .where(eq(artists.id, artistId))
    .execute();

  console.log(`[Featured] Unpinned artist ${artistId}, reset to tier defaults`);
}

/**
 * Track when artists are displayed in featured rotation
 * Updates lastFeaturedAt timestamp for fair rotation
 */
export async function trackFeaturedDisplay(artistIds: string[]): Promise<void> {
  if (artistIds.length === 0) return;
  
  const now = new Date();
  
  // Update all featured artists' lastFeaturedAt timestamp
  for (const artistId of artistIds) {
    await db
      .update(artists)
      .set({ lastFeaturedAt: now })
      .where(eq(artists.id, artistId))
      .execute();
  }
  
  console.log(`[Featured] Tracked ${artistIds.length} artists in rotation`);
}
