import type { IStorage } from "./storage";
import type { Achievement, Influencer } from "@shared/schema";

interface AchievementCriteria {
  type: 
    | "total_conversions" 
    | "first_sale_days" 
    | "artists_recruited" 
    | "tier_reached" 
    | "conversion_rate" 
    | "conversions_in_hours" 
    | "total_earnings";
  value: number | string | { hours: number; conversions: number };
}

export class AchievementService {
  constructor(private storage: IStorage) {}

  /**
   * Check and unlock achievements for an influencer based on their current stats
   * Returns newly unlocked achievement codes
   */
  async checkAndUnlockAchievements(influencerId: string): Promise<string[]> {
    try {
      // Get influencer data
      const influencer = await this.storage.getInfluencer(influencerId);
      if (!influencer) {
        return [];
      }

      // Get all active achievements
      const allAchievements = await this.storage.getAllAchievements();
      
      // Get already unlocked achievements
      const unlockedBadges = await this.storage.getInfluencerBadges(influencerId);
      const unlockedCodes = new Set(unlockedBadges.map(b => b.code));

      // Get influencer stats for criteria checking
      const stats = await this.getInfluencerStats(influencerId);

      const newlyUnlocked: string[] = [];

      // Check each achievement
      for (const achievement of allAchievements) {
        // Skip if already unlocked
        if (unlockedCodes.has(achievement.code)) {
          continue;
        }

        // Check if criteria is met
        const criteria = achievement.criteria as AchievementCriteria;
        const isMet = await this.checkCriteria(criteria, influencer, stats);

        if (isMet) {
          // Unlock the achievement
          await this.unlockAchievement(influencerId, achievement);
          newlyUnlocked.push(achievement.code);
        }
      }

      return newlyUnlocked;
    } catch (error) {
      console.error("Error checking achievements:", error);
      return [];
    }
  }

  /**
   * Check if a specific criteria is met
   */
  private async checkCriteria(
    criteria: AchievementCriteria,
    influencer: Influencer,
    stats: InfluencerStats
  ): Promise<boolean> {
    switch (criteria.type) {
      case "total_conversions":
        return stats.totalConversions >= (criteria.value as number);

      case "total_earnings":
        return stats.totalEarnings >= (criteria.value as number);

      case "artists_recruited":
        return stats.artistsRecruited >= (criteria.value as number);

      case "tier_reached":
        return influencer.currentTier === criteria.value;

      case "conversion_rate":
        return stats.conversionRate >= (criteria.value as number);

      case "first_sale_days": {
        // Check if first conversion happened within X days of joining
        if (stats.totalConversions === 0) return false;
        
        const daysSinceJoining = Math.floor(
          (stats.firstConversionDate!.getTime() - new Date(influencer.createdAt).getTime()) 
          / (1000 * 60 * 60 * 24)
        );
        return daysSinceJoining <= (criteria.value as number);
      }

      case "conversions_in_hours": {
        // Check if X conversions happened within Y hours
        const config = criteria.value as { hours: number; conversions: number };
        const recentCount = await this.storage.getRecentConversionsCount(
          influencer.id,
          config.hours
        );
        return recentCount >= config.conversions;
      }

      default:
        return false;
    }
  }

  /**
   * Unlock an achievement for an influencer
   */
  private async unlockAchievement(influencerId: string, achievement: { id: string; code: string; name: string; rarity: string; points: number }): Promise<void> {
    try {
      // Create the unlock record (unlockAchievement expects achievementCode)
      await this.storage.unlockAchievement(influencerId, achievement.code);

      console.log(`✅ Unlocked achievement "${achievement.name}" for influencer ${influencerId}`);
    } catch (error) {
      console.error(`Error unlocking achievement ${achievement.id}:`, error);
    }
  }

  /**
   * Get influencer stats for criteria checking
   */
  private async getInfluencerStats(influencerId: string): Promise<InfluencerStats> {
    const stats = await this.storage.getInfluencerConversionStats(influencerId);
    
    const totalConversions = stats.totalConversions;
    const totalClicks = stats.totalClicks;
    const totalEarnings = parseFloat(stats.totalEarnings);
    const conversionRate = stats.conversionRate;
    const artistsRecruited = stats.artistsRecruited;
    const firstConversionDate = stats.firstConversionDate;

    return {
      totalConversions,
      totalEarnings,
      artistsRecruited,
      conversionRate,
      firstConversionDate,
    };
  }

  /**
   * Trigger achievement checks when specific events occur
   */
  async onConversionCreated(influencerId: string): Promise<void> {
    await this.checkAndUnlockAchievements(influencerId);
  }

  async onTierUpgrade(influencerId: string): Promise<void> {
    await this.checkAndUnlockAchievements(influencerId);
  }
}

interface InfluencerStats {
  totalConversions: number;
  totalEarnings: number;
  artistsRecruited: number;
  conversionRate: number;
  firstConversionDate: Date | null;
}
