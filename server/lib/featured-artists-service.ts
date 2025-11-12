import { db } from "./db";
import { artists, artworks } from "@shared/schema";
import { eq, and, desc, or, isNull, gte, sql } from "drizzle-orm";

/**
 * Featured Artists Service
 * 
 * Automatically manages which artists appear on the homepage featured section
 * based on subscription tier, performance, and admin overrides.
 * 
 * Business Rules:
 * - Elite members: Always eligible (priority 100)
 * - Pro members: Eligible if approved (priority 50 + performance boost)
 * - Free members: Only if manually approved by admin (priority 0-25)
 * - Pinned artists: Guaranteed featured until featuredPinnedUntil date
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
 * Returns 4-8 artists sorted by priority and performance
 */
export async function getFeaturedArtists(limit: number = 4): Promise<FeaturedArtist[]> {
  const now = new Date();
  
  // Get artists who are:
  // 1. Approved
  // 2. Not deleted
  // 3. Either: eligible OR pinned until future date
  const featuredArtists = await db
    .select({
      id: artists.id,
      name: artists.name,
      bio: artists.bio,
      profilePhoto: artists.profilePhoto,
      subscriptionTier: artists.subscriptionTier,
      monthlySales: artists.monthlySales,
      featuredPriority: artists.featuredPriority,
      featuredPinnedUntil: artists.featuredPinnedUntil,
      isFeaturedEligible: artists.isFeaturedEligible,
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
    .orderBy(
      desc(artists.featuredPriority),
      desc(artists.monthlySales)
    )
    .limit(Math.max(limit, 4)) // Always get at least 4
    .execute();

  // For each artist, count their approved artworks
  const artistsWithCounts = await Promise.all(
    featuredArtists.map(async (artist) => {
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

      // Determine specialty based on tier or bio
      let specialty = "Featured Artist";
      if (artist.subscriptionTier === "elite") {
        specialty = "Elite Creator";
      } else if (artist.subscriptionTier === "pro") {
        specialty = "Pro Artist";
      } else if (artist.bio) {
        // Extract first sentence or phrase from bio
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

  // Return all featured artists regardless of artwork count
  // Artists can be featured even without approved artworks yet
  return artistsWithCounts;
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
