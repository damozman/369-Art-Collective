import { storage } from '../storage';

/**
 * Featured Rotation Service
 * Handles monthly rotation of merit-based featured testimonials
 */

export interface RotationResult {
  success: boolean;
  message: string;
  rotatedIn: Array<{
    testimonialId: string;
    artistId: string;
    artistName: string;
    monthlyEarnings: string;
  }>;
  rotatedOut: Array<{
    testimonialId: string;
    artistId: string;
    reason: string;
  }>;
  keptActive: Array<{
    testimonialId: string;
    artistId: string;
    reason: string;
  }>;
}

/**
 * Perform monthly merit-based rotation
 * - Ends expired subscriptions
 * - Selects top 5 artists by monthly earnings
 * - Creates new merit subscriptions
 * - Updates testimonial featured flags
 * - Logs all changes
 */
export async function performMonthlyRotation(): Promise<RotationResult> {
  const result: RotationResult = {
    success: false,
    message: '',
    rotatedIn: [],
    rotatedOut: [],
    keptActive: [],
  };

  try {
    console.log('🔄 Starting monthly merit-based featured rotation...');
    
    // Step 1: Get current merit-based subscriptions
    const currentMeritSubs = await storage.getFeaturedSlotsByTier('merit');
    const activeMeritSubs = currentMeritSubs.filter(sub => !sub.endDate);
    
    console.log(`📊 Found ${activeMeritSubs.length} active merit subscriptions`);
    
    // Step 2: Get top 5 artists by monthly earnings with tie-breaking
    // Minimum earnings threshold: $0 (include all artists with any earnings)
    const minEarnings = 0;
    const topArtists = await storage.getTopEarningArtistsForRotation(5, minEarnings);
    
    console.log(`🏆 Top ${topArtists.length} earning artists identified for merit rotation`);
    
    // Step 4: End all current merit subscriptions
    const now = new Date();
    for (const sub of activeMeritSubs) {
      await storage.updateFeaturedSubscription(sub.id, {
        endDate: now,
        endReason: 'monthly_rotation',
      });
      
      // Unfeature the testimonial (will be re-featured if they make top 5 again)
      await storage.updateTestimonial(sub.testimonialId, { featured: false });
      
      result.rotatedOut.push({
        testimonialId: sub.testimonialId,
        artistId: sub.artistId,
        reason: 'Monthly rotation',
      });
      
      console.log(`⏹️ Ended merit subscription for testimonial ${sub.testimonialId}`);
    }
    
    // Step 5: Create new merit subscriptions for top artists
    for (const artist of topArtists) {
      // Check if artist has an active testimonial
      if (!artist.testimonialId) {
        console.log(`⚠️ Artist ${artist.artistId} has no testimonial, skipping`);
        continue;
      }
      
      // Check if this artist was already in the top 5 (kept active)
      const wasAlreadyFeatured = activeMeritSubs.some(
        sub => sub.artistId === artist.artistId
      );
      
      // Calculate next rotation date (30 days from now)
      const expiresAt = new Date(now);
      expiresAt.setDate(expiresAt.getDate() + 30);
      
      // Create new merit subscription
      await storage.createFeaturedSubscription({
        artistId: artist.artistId,
        testimonialId: artist.testimonialId,
        featuredTier: 'merit',
        startDate: now,
        expiresAt,
        tierPriority: 3, // Merit tier
      });
      
      // Feature the testimonial
      await storage.updateTestimonial(artist.testimonialId, { featured: true });
      
      // Log the rotation
      await storage.logFeaturedRotation({
        rotationDate: now,
        testimonialId: artist.testimonialId,
        artistId: artist.artistId,
        featuredTier: 'merit',
        artistEarnings: artist.totalEarnings,
        rank: artist.rank,
        action: wasAlreadyFeatured ? 'renewed' : 'added',
        reason: `Ranked #${artist.rank} by monthly earnings ($${artist.monthlyEarnings})`,
      });
      
      if (wasAlreadyFeatured) {
        result.keptActive.push({
          testimonialId: artist.testimonialId,
          artistId: artist.artistId,
          reason: `Kept rank #${artist.rank}`,
        });
      } else {
        result.rotatedIn.push({
          testimonialId: artist.testimonialId,
          artistId: artist.artistId,
          artistName: artist.artistName,
          monthlyEarnings: artist.monthlyEarnings,
        });
      }
      
      console.log(`✅ Created merit subscription for artist ${artist.artistName} (rank #${artist.rank}, $${artist.monthlyEarnings})`);
    }
    
    result.success = true;
    result.message = `Rotation complete: ${result.rotatedIn.length} new, ${result.keptActive.length} kept, ${result.rotatedOut.length} removed`;
    
    console.log(`🎉 Monthly rotation complete: ${result.message}`);
    
    return result;
  } catch (error) {
    console.error('❌ Monthly rotation failed:', error);
    result.success = false;
    result.message = `Rotation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    throw error;
  }
}

/**
 * Get current rotation status (who's featured and why)
 */
export async function getRotationStatus() {
  try {
    // Get all active featured subscriptions by tier
    const [adminOverrides, premiumSubs, meritSubs] = await Promise.all([
      storage.getFeaturedSlotsByTier('admin_override'),
      storage.getFeaturedSlotsByTier('premium'),
      storage.getFeaturedSlotsByTier('merit'),
    ]);
    
    // Filter to active only
    const activeOverrides = adminOverrides.filter(sub => !sub.endDate);
    const activePremium = premiumSubs.filter(sub => !sub.endDate);
    const activeMerit = meritSubs.filter(sub => !sub.endDate);
    
    return {
      totalSlots: 7,
      usedSlots: activeOverrides.length + activePremium.length + activeMerit.length,
      breakdown: {
        adminOverride: {
          count: activeOverrides.length,
          subscriptions: activeOverrides,
        },
        premium: {
          count: activePremium.length,
          subscriptions: activePremium,
        },
        merit: {
          count: activeMerit.length,
          maxSlots: 5,
          subscriptions: activeMerit,
        },
      },
    };
  } catch (error) {
    console.error('Failed to get rotation status:', error);
    throw error;
  }
}
