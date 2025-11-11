import {
  artists,
  artworks as artworksTable,
  admins as adminsTable,
  orders as ordersTable,
  sales as salesTable,
  payouts as payoutsTable,
  passwordResetTokens,
  portfolioSubmissions,
  violationReports,
  stripeWebhookEvents,
  testimonials,
  featuredSubscriptions,
  featuredRotationLog,
  influencers,
  affiliateClicks,
  affiliateConversions,
  achievements,
  influencerAchievements,
  challenges,
  challengeParticipants,
  activityFeedEvents,
  type Artist,
  type InsertArtist,
  type Admin,
  type InsertAdmin,
  type Artwork,
  type InsertArtwork,
  type UpdateArtwork,
  type ArtworkWithArtist,
  type PasswordResetToken,
  type PortfolioSubmission,
  type InsertPortfolioSubmission,
  type ViolationReport,
  type InsertViolationReport,
  type StripeWebhookEvent,
  type InsertStripeWebhookEvent,
  type Testimonial,
  type InsertTestimonial,
  type TestimonialWithArtist,
  type FeaturedSubscription,
  type InsertFeaturedSubscription,
  type FeaturedRotationLog,
  type FeaturedTier,
  type Influencer,
  type InsertInfluencer,
  type AffiliateClick,
  type InsertAffiliateClick,
  type AffiliateConversion,
  type InsertAffiliateConversion,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db, isDatabaseConfigured } from "./lib/db";
import { eq, isNull, isNotNull, and, desc, asc, gte, sql as drizzleSql, sum } from "drizzle-orm";
import { generateReferralCode } from "./lib/referral-code-generator";

export interface IStorage {
  // Artist methods
  getArtist(id: string): Promise<Artist | undefined>;
  getArtistByEmail(email: string): Promise<Artist | undefined>;
  getArtistByReferralCode(referralCode: string): Promise<Artist | undefined>;
  getAllArtists(): Promise<Artist[]>;
  createArtist(artist: InsertArtist): Promise<Artist>;
  updateArtist(id: string, updates: Partial<Artist>): Promise<Artist>;
  deleteArtist(id: string): Promise<Artist>;

  // Admin methods
  getAdmin(id: string): Promise<Admin | undefined>;
  getAdminByEmail(email: string): Promise<Admin | undefined>;
  createAdmin(admin: InsertAdmin): Promise<Admin>;
  updateAdmin(id: string, updates: Partial<Admin>): Promise<Admin>;

  // Password Reset Token methods
  createPasswordResetToken(email: string, hashedToken: string, userType: 'artist' | 'admin', expiresAt: Date): Promise<PasswordResetToken>;
  getPasswordResetToken(hashedToken: string): Promise<PasswordResetToken | undefined>;
  markTokenAsUsed(hashedToken: string): Promise<void>;
  invalidateUserTokens(email: string, userType: 'artist' | 'admin'): Promise<void>;

  // Portfolio Submission methods
  createPortfolioSubmission(submission: InsertPortfolioSubmission): Promise<PortfolioSubmission>;
  getPortfolioSubmissionsByArtist(artistId: string): Promise<PortfolioSubmission[]>;

  // Violation Report methods
  createViolationReport(report: InsertViolationReport): Promise<ViolationReport>;
  getViolationReportsByArtwork(artworkId: string): Promise<ViolationReport[]>;
  getAllViolationReports(): Promise<ViolationReport[]>;

  // Artwork methods
  getArtwork(id: string): Promise<Artwork | undefined>;
  getArtworksByArtist(artistId: string): Promise<Artwork[]>;
  getAllArtworks(): Promise<ArtworkWithArtist[]>;
  createArtwork(artwork: InsertArtwork): Promise<Artwork>;
  updateArtwork(id: string, updates: Partial<Artwork>): Promise<Artwork>;

  // Order methods (MVP)
  createOrder(order: any): Promise<any>;
  updateOrder(id: string, updates: any): Promise<any>;
  getAllOrders(): Promise<any[]>;
  
  // Sale methods (MVP)
  createSale(sale: any): Promise<any>;
  getSalesByArtist(artistId: string): Promise<any[]>;
  updateSale(id: string, updates: any): Promise<any>;
  
  // Payout methods
  createPayout(payout: any): Promise<any>;
  updatePayout(id: string, updates: any): Promise<any>;
  getPayoutsByArtist(artistId: string): Promise<any[]>;
  getPendingPayouts(): Promise<any[]>;
  getAllPayouts(): Promise<any[]>;

  // Stripe Webhook Event methods
  createStripeWebhookEvent(event: InsertStripeWebhookEvent): Promise<StripeWebhookEvent>;
  getStripeWebhookEvent(eventId: string): Promise<StripeWebhookEvent | undefined>;
  updateStripeWebhookEvent(id: string, updates: Partial<StripeWebhookEvent>): Promise<StripeWebhookEvent>;

  // Testimonial methods
  createTestimonial(testimonial: InsertTestimonial): Promise<Testimonial>;
  updateTestimonial(id: string, updates: Partial<Testimonial>): Promise<Testimonial>;
  deleteTestimonial(id: string): Promise<void>;
  getTestimonial(id: string): Promise<Testimonial | undefined>;
  getTestimonialBySlug(slug: string): Promise<Testimonial | undefined>;
  getAllTestimonials(): Promise<Testimonial[]>;
  getActiveTestimonials(limit?: number): Promise<Testimonial[]>;
  reorderTestimonials(reorderedItems: Array<{ id: string; displayOrder: number }>): Promise<void>;
  
  // Testimonial methods with artist data (for affiliate links)
  getAllTestimonialsWithArtist(): Promise<TestimonialWithArtist[]>;
  getTestimonialBySlugWithArtist(slug: string): Promise<TestimonialWithArtist | undefined>;
  getFeaturedTestimonialsWithArtist(): Promise<TestimonialWithArtist[]>;

  // Featured Subscription methods
  createFeaturedSubscription(subscription: InsertFeaturedSubscription): Promise<FeaturedSubscription>;
  updateFeaturedSubscription(id: string, updates: Partial<FeaturedSubscription>): Promise<FeaturedSubscription>;
  getFeaturedSubscriptionsByArtist(artistId: string): Promise<FeaturedSubscription[]>;
  getActiveFeaturedSubscriptions(): Promise<FeaturedSubscription[]>;
  getActiveFeaturedSubscriptionByArtist(artistId: string): Promise<FeaturedSubscription | undefined>;
  getFeaturedSlotsByTier(tier: string): Promise<FeaturedSubscription[]>;
  getFeaturedSubscriptionByStripeId(stripeSubscriptionId: string): Promise<FeaturedSubscription | undefined>;
  endFeaturedSubscription(id: string, endDate: Date, endReason: string): Promise<FeaturedSubscription>;
  
  // Admin override management
  createAdminOverride(testimonialId: string, adminId: string): Promise<{ subscription: FeaturedSubscription; totalSlots: number }>;
  removeAdminOverride(subscriptionId: string, adminId: string, reason?: string): Promise<void>;
  getFeaturedPlacementsOverview(): Promise<{
    totalSlots: number;
    slotsByTier: { admin_override: number; premium: number; merit: number };
    placements: Array<{
      id: string;
      testimonialId: string;
      artistId: string;
      artistName: string;
      testimonialTitle: string;
      featuredTier: string;
      startDate: Date;
      endDate: Date | null;
      stripeSubscriptionId?: string;
      stripeSubscriptionStatus?: string;
      rank?: number;
      monthlyEarnings?: string;
    }>;
    nextRotationDate?: Date;
  }>;
  
  // Featured testimonials display with tier info
  getFeaturedTestimonials(): Promise<Array<{
    testimonial: Testimonial;
    tier: string;
    status?: string;
    activeUntil?: Date | null;
    tierPriority: number;
  }>>;
  
  // Featured rotation log
  logFeaturedRotation(log: {
    rotationDate: Date;
    testimonialId: string;
    artistId: string;
    featuredTier: string;
    artistEarnings: string;
    rank?: number;
    action: string;
    reason?: string;
  }): Promise<FeaturedRotationLog>;
  
  // Helper for rotation: Get top earning artists with tie-break
  getTopEarningArtistsForRotation(limit: number, minEarnings: number): Promise<Array<{
    artistId: string;
    artistName: string;
    testimonialId: string | null;
    monthlyEarnings: string;
    totalEarnings: string;
    rank: number;
  }>>;
  
  // ===================================
  // INFLUENCER AFFILIATE PROGRAM METHODS
  // ===================================
  
  // Influencer CRUD
  getInfluencer(id: string): Promise<Influencer | undefined>;
  getInfluencerByEmail(email: string): Promise<Influencer | undefined>;
  getInfluencerByAffiliateCode(affiliateCode: string): Promise<Influencer | undefined>;
  getAllInfluencers(filters?: { status?: string; search?: string }): Promise<Influencer[]>;
  createInfluencer(influencer: InsertInfluencer): Promise<Influencer>;
  updateInfluencer(id: string, updates: Partial<Influencer>): Promise<Influencer>;
  approveInfluencer(id: string): Promise<Influencer>;
  
  // Affiliate tracking
  createAffiliateClick(click: InsertAffiliateClick): Promise<AffiliateClick>;
  createAffiliateConversion(conversion: InsertAffiliateConversion): Promise<AffiliateConversion>;
  
  // Performance stats (calculated on-demand)
  getInfluencerPerformanceSummary(influencerId: string): Promise<{
    totalClicks: number;
    totalConversions: number;
    conversionRate: number;
    totalEarnings: string;
    pendingEarnings: string;
    monthlySalesCount: number; // For tier calculation
    currentTier: string;
  }>;
  
  // Stats for achievement checking
  getInfluencerConversionStats(influencerId: string): Promise<{
    totalConversions: number;
    totalClicks: number;
    totalEarnings: string;
    conversionRate: number;
    artistsRecruited: number;
    firstConversionDate: Date | null;
  }>;
  getRecentConversionsCount(influencerId: string, hours: number): Promise<number>;
  
  // ===================================
  // GAMIFICATION METHODS
  // ===================================
  
  // Leaderboard
  getLeaderboard(metric: string, period: string): Promise<Array<{
    influencerId: string;
    influencerName: string;
    avatarUrl?: string;
    currentTier: string;
    score: number;
    rank: number;
  }>>;
  
  // Achievements/Badges
  getInfluencerBadges(influencerId: string): Promise<Array<{
    achievementId: string;
    code: string;
    name: string;
    description: string;
    icon: string;
    category: string;
    rarity: string;
    points: number;
    unlockedAt: Date;
  }>>;
  getAllAchievements(): Promise<Array<{
    id: string;
    code: string;
    name: string;
    description: string;
    icon: string;
    category: string;
    rarity: string;
    points: number;
    criteria: any;
  }>>;
  unlockAchievement(influencerId: string, achievementCode: string): Promise<void>;
  
  // Challenges
  getActiveChallenges(): Promise<Array<{
    id: string;
    name: string;
    description: string;
    challengeType: string;
    metric: string;
    goal?: string;
    startDate: Date;
    endDate: Date;
    firstPlacePrize: string;
    secondPlacePrize?: string;
    thirdPlacePrize?: string;
    prizeDescription?: string;
    status: string;
    participantCount: number;
  }>>;
  createChallenge(challenge: {
    name: string;
    description: string;
    challengeType: string;
    metric: string;
    goal: string | null;
    startDate: Date;
    endDate: Date;
    firstPlacePrize: string;
    secondPlacePrize: string | null;
    thirdPlacePrize: string | null;
    prizeDescription: string | null;
    status: string;
  }): Promise<any>;
  updateChallengeStatus(challengeId: string, status: string): Promise<void>;
  joinChallenge(challengeId: string, influencerId: string): Promise<void>;
  getChallengeLeaderboard(challengeId: string): Promise<Array<{
    influencerId: string;
    influencerName: string;
    currentScore: string;
    rank?: number;
  }>>;
  
  // Activity Feed
  getActivityFeed(limit: number): Promise<Array<{
    id: string;
    influencerId: string;
    influencerName: string;
    eventType: string;
    eventData: any;
    message: string;
    createdAt: Date;
  }>>;
}

// PostgreSQL storage implementation using Drizzle ORM
class PostgresStorage implements IStorage {
  async getArtist(id: string): Promise<Artist | undefined> {
    const [artist] = await db
      .select()
      .from(artists)
      .where(eq(artists.id, id))
      .limit(1);
    
    // Filter out deleted artists
    if (artist?.deletedAt) {
      return undefined;
    }
    return artist;
  }

  async getArtistByEmail(email: string): Promise<Artist | undefined> {
    const [artist] = await db
      .select()
      .from(artists)
      .where(eq(artists.email, email))
      .limit(1);
    
    // Filter out deleted artists
    if (artist?.deletedAt) {
      return undefined;
    }
    return artist;
  }

  async getArtistByReferralCode(referralCode: string): Promise<Artist | undefined> {
    const [artist] = await db
      .select()
      .from(artists)
      .where(eq(artists.referralCode, referralCode))
      .limit(1);
    
    // Filter out deleted artists
    if (artist?.deletedAt) {
      return undefined;
    }
    return artist;
  }

  async getAllArtists(): Promise<Artist[]> {
    const allArtists = await db
      .select()
      .from(artists)
      .where(isNull(artists.deletedAt))
      .orderBy(artists.createdAt);
    return allArtists;
  }

  async createArtist(insertArtist: InsertArtist): Promise<Artist> {
    // Always generate a new unique referral code for this artist
    const referralCode = generateReferralCode(insertArtist.name);
    
    const [artist] = await db
      .insert(artists)
      .values({
        ...insertArtist,
        referralCode,
      })
      .returning();
    return artist;
  }

  async updateArtist(id: string, updates: Partial<Artist>): Promise<Artist> {
    const [updatedArtist] = await db
      .update(artists)
      .set(updates)
      .where(eq(artists.id, id))
      .returning();
    if (!updatedArtist) throw new Error("Artist not found");
    return updatedArtist;
  }

  async deleteArtist(id: string): Promise<Artist> {
    const [deletedArtist] = await db
      .update(artists)
      .set({ deletedAt: new Date() })
      .where(eq(artists.id, id))
      .returning();
    if (!deletedArtist) throw new Error("Artist not found");
    return deletedArtist;
  }

  async getAdmin(id: string): Promise<Admin | undefined> {
    const [admin] = await db
      .select()
      .from(adminsTable)
      .where(eq(adminsTable.id, id))
      .limit(1);
    return admin;
  }

  async getAdminByEmail(email: string): Promise<Admin | undefined> {
    const [admin] = await db
      .select()
      .from(adminsTable)
      .where(eq(adminsTable.email, email))
      .limit(1);
    return admin;
  }

  async createAdmin(insertAdmin: InsertAdmin): Promise<Admin> {
    const [admin] = await db
      .insert(adminsTable)
      .values(insertAdmin)
      .returning();
    return admin;
  }

  async updateAdmin(id: string, updates: Partial<Admin>): Promise<Admin> {
    const [updatedAdmin] = await db
      .update(adminsTable)
      .set(updates)
      .where(eq(adminsTable.id, id))
      .returning();
    if (!updatedAdmin) throw new Error("Admin not found");
    return updatedAdmin;
  }

  async createPasswordResetToken(email: string, hashedToken: string, userType: 'artist' | 'admin', expiresAt: Date): Promise<PasswordResetToken> {
    const [token] = await db
      .insert(passwordResetTokens)
      .values({
        email,
        hashedToken,
        userType,
        expiresAt,
      })
      .returning();
    return token;
  }

  async getPasswordResetToken(hashedToken: string): Promise<PasswordResetToken | undefined> {
    const [token] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.hashedToken, hashedToken))
      .limit(1);
    return token;
  }

  async markTokenAsUsed(hashedToken: string): Promise<void> {
    await db
      .update(passwordResetTokens)
      .set({ isUsed: true })
      .where(eq(passwordResetTokens.hashedToken, hashedToken));
  }

  async invalidateUserTokens(email: string, userType: 'artist' | 'admin'): Promise<void> {
    await db
      .update(passwordResetTokens)
      .set({ isUsed: true })
      .where(eq(passwordResetTokens.email, email));
  }

  async createPortfolioSubmission(submission: InsertPortfolioSubmission): Promise<PortfolioSubmission> {
    const [portfolioSubmission] = await db
      .insert(portfolioSubmissions)
      .values(submission)
      .returning();
    return portfolioSubmission;
  }

  async getPortfolioSubmissionsByArtist(artistId: string): Promise<PortfolioSubmission[]> {
    const submissions = await db
      .select()
      .from(portfolioSubmissions)
      .where(eq(portfolioSubmissions.artistId, artistId))
      .orderBy(portfolioSubmissions.createdAt);
    return submissions;
  }

  async createViolationReport(report: InsertViolationReport): Promise<ViolationReport> {
    const [violationReport] = await db
      .insert(violationReports)
      .values(report)
      .returning();
    return violationReport;
  }

  async getViolationReportsByArtwork(artworkId: string): Promise<ViolationReport[]> {
    const reports = await db
      .select()
      .from(violationReports)
      .where(eq(violationReports.artworkId, artworkId))
      .orderBy(violationReports.createdAt);
    return reports;
  }

  async getAllViolationReports(): Promise<ViolationReport[]> {
    const reports = await db
      .select()
      .from(violationReports)
      .orderBy(violationReports.createdAt);
    return reports;
  }

  async getArtwork(id: string): Promise<Artwork | undefined> {
    const [artwork] = await db
      .select()
      .from(artworksTable)
      .where(eq(artworksTable.id, id))
      .limit(1);
    return artwork;
  }

  async getArtworksByArtist(artistId: string): Promise<Artwork[]> {
    const artworks = await db
      .select()
      .from(artworksTable)
      .where(eq(artworksTable.artistId, artistId))
      .orderBy(artworksTable.createdAt);
    return artworks;
  }

  async getAllArtworks(): Promise<ArtworkWithArtist[]> {
    const allArtworks = await db
      .select()
      .from(artworksTable)
      .orderBy(artworksTable.createdAt);
    
    const artworksWithArtist = await Promise.all(
      allArtworks.map(async (artwork) => {
        const [artist] = await db
          .select({
            id: artists.id,
            name: artists.name,
            email: artists.email,
          })
          .from(artists)
          .where(eq(artists.id, artwork.artistId))
          .limit(1);
        
        return {
          ...artwork,
          artist,
        };
      })
    );
    
    return artworksWithArtist as ArtworkWithArtist[];
  }

  async createArtwork(insertArtwork: InsertArtwork): Promise<Artwork> {
    const [artwork] = await db
      .insert(artworksTable)
      .values(insertArtwork)
      .returning();
    return artwork;
  }

  async updateArtwork(id: string, updates: Partial<Artwork>): Promise<Artwork> {
    const [updatedArtwork] = await db
      .update(artworksTable)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(artworksTable.id, id))
      .returning();
    if (!updatedArtwork) throw new Error("Artwork not found");
    return updatedArtwork;
  }

  // Order/Sale/Payout methods
  async createOrder(order: any): Promise<any> {
    const [createdOrder] = await db
      .insert(ordersTable)
      .values(order)
      .returning();
    return createdOrder;
  }

  async updateOrder(id: string, updates: any): Promise<any> {
    const [updatedOrder] = await db
      .update(ordersTable)
      .set(updates)
      .where(eq(ordersTable.id, id))
      .returning();
    if (!updatedOrder) throw new Error("Order not found");
    return updatedOrder;
  }

  async getAllOrders(): Promise<any[]> {
    const allOrders = await db
      .select()
      .from(ordersTable);
    return allOrders;
  }

  async createSale(sale: any): Promise<any> {
    const [createdSale] = await db
      .insert(salesTable)
      .values(sale)
      .returning();
    return createdSale;
  }

  async getSalesByArtist(artistId: string): Promise<any[]> {
    const artistSales = await db
      .select()
      .from(salesTable)
      .where(eq(salesTable.artistId, artistId))
      .orderBy(salesTable.createdAt);
    return artistSales;
  }

  async updateSale(id: string, updates: any): Promise<any> {
    const [updatedSale] = await db
      .update(salesTable)
      .set(updates)
      .where(eq(salesTable.id, id))
      .returning();
    return updatedSale;
  }

  async createPayout(payout: any): Promise<any> {
    const [createdPayout] = await db
      .insert(payoutsTable)
      .values(payout)
      .returning();
    return createdPayout;
  }

  async updatePayout(id: string, updates: any): Promise<any> {
    const [updatedPayout] = await db
      .update(payoutsTable)
      .set(updates)
      .where(eq(payoutsTable.id, id))
      .returning();
    if (!updatedPayout) throw new Error("Payout not found");
    return updatedPayout;
  }

  async getPayoutsByArtist(artistId: string): Promise<any[]> {
    const artistPayouts = await db
      .select()
      .from(payoutsTable)
      .where(eq(payoutsTable.artistId, artistId))
      .orderBy(payoutsTable.createdAt);
    return artistPayouts;
  }

  async getPendingPayouts(): Promise<any[]> {
    const pendingPayouts = await db
      .select()
      .from(payoutsTable)
      .where(eq(payoutsTable.status, 'pending'))
      .orderBy(payoutsTable.createdAt);
    return pendingPayouts;
  }

  async getAllPayouts(): Promise<any[]> {
    const allPayouts = await db
      .select()
      .from(payoutsTable)
      .orderBy(payoutsTable.createdAt);
    return allPayouts;
  }

  async createStripeWebhookEvent(event: InsertStripeWebhookEvent): Promise<StripeWebhookEvent> {
    const [webhookEvent] = await db
      .insert(stripeWebhookEvents)
      .values(event)
      .returning();
    return webhookEvent;
  }

  async getStripeWebhookEvent(eventId: string): Promise<StripeWebhookEvent | undefined> {
    const [event] = await db
      .select()
      .from(stripeWebhookEvents)
      .where(eq(stripeWebhookEvents.eventId, eventId))
      .limit(1);
    return event;
  }

  async updateStripeWebhookEvent(id: string, updates: Partial<StripeWebhookEvent>): Promise<StripeWebhookEvent> {
    const [updatedEvent] = await db
      .update(stripeWebhookEvents)
      .set(updates)
      .where(eq(stripeWebhookEvents.id, id))
      .returning();
    if (!updatedEvent) throw new Error("Webhook event not found");
    return updatedEvent;
  }

  async createTestimonial(testimonial: InsertTestimonial): Promise<Testimonial> {
    const [newTestimonial] = await db
      .insert(testimonials)
      .values(testimonial)
      .returning();
    return newTestimonial;
  }

  async updateTestimonial(id: string, updates: Partial<Testimonial>): Promise<Testimonial> {
    const [updated] = await db
      .update(testimonials)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(testimonials.id, id))
      .returning();
    if (!updated) throw new Error("Testimonial not found");
    return updated;
  }

  async deleteTestimonial(id: string): Promise<void> {
    await db.delete(testimonials).where(eq(testimonials.id, id));
  }

  async getTestimonial(id: string): Promise<Testimonial | undefined> {
    const [testimonial] = await db
      .select()
      .from(testimonials)
      .where(eq(testimonials.id, id))
      .limit(1);
    return testimonial;
  }

  async getTestimonialBySlug(slug: string): Promise<Testimonial | undefined> {
    const [testimonial] = await db
      .select()
      .from(testimonials)
      .where(eq(testimonials.shareSlug, slug))
      .limit(1);
    return testimonial;
  }

  async getAllTestimonials(): Promise<Testimonial[]> {
    const allTestimonials = await db
      .select()
      .from(testimonials)
      .orderBy(testimonials.displayOrder, testimonials.createdAt);
    return allTestimonials;
  }

  async getActiveTestimonials(limit?: number): Promise<Testimonial[]> {
    let query = db
      .select()
      .from(testimonials)
      .where(eq(testimonials.isActive, true))
      .orderBy(testimonials.displayOrder, testimonials.createdAt);
    
    if (limit) {
      query = query.limit(limit) as any;
    }
    
    return await query;
  }

  async reorderTestimonials(reorderedItems: Array<{ id: string; displayOrder: number }>): Promise<void> {
    // Update display order for each testimonial
    for (const item of reorderedItems) {
      await db
        .update(testimonials)
        .set({ displayOrder: item.displayOrder, updatedAt: new Date() })
        .where(eq(testimonials.id, item.id));
    }
  }

  async getAllTestimonialsWithArtist(): Promise<TestimonialWithArtist[]> {
    const results = await db
      .select({
        testimonial: testimonials,
        artistReferralCode: artists.referralCode,
      })
      .from(testimonials)
      .leftJoin(artists, eq(testimonials.artistId, artists.id))
      .orderBy(testimonials.displayOrder, testimonials.createdAt);
    
    return results.map(row => ({
      ...row.testimonial,
      artistReferralCode: row.artistReferralCode,
    }));
  }

  async getTestimonialBySlugWithArtist(slug: string): Promise<TestimonialWithArtist | undefined> {
    const [result] = await db
      .select({
        testimonial: testimonials,
        artistReferralCode: artists.referralCode,
      })
      .from(testimonials)
      .leftJoin(artists, eq(testimonials.artistId, artists.id))
      .where(eq(testimonials.shareSlug, slug))
      .limit(1);
    
    if (!result) return undefined;
    
    return {
      ...result.testimonial,
      artistReferralCode: result.artistReferralCode,
    };
  }

  async getFeaturedTestimonialsWithArtist(): Promise<TestimonialWithArtist[]> {
    // Use raw SQL to avoid Drizzle query builder SQL generation issues
    const query = drizzleSql`
      SELECT 
        t.id,
        t.artist_id as "artistId",
        t.artist_name as "artistName",
        t.title,
        t.quote,
        t.video_provider as "videoProvider",
        t.video_url as "videoUrl",
        t.video_thumbnail_url as "videoThumbnailUrl",
        t.local_video_path as "localVideoPath",
        t.earnings_usd as "earningsUsd",
        t.products_count as "productsCount",
        t.featured,
        t.is_active as "isActive",
        t.display_order as "displayOrder",
        t.share_slug as "shareSlug",
        t.share_excerpt as "shareExcerpt",
        t.share_image_url as "shareImageUrl",
        t.allow_embed as "allowEmbed",
        t.artist_consent as "artistConsent",
        t.consent_timestamp as "consentTimestamp",
        t.consent_version as "consentVersion",
        t.approved_by_admin_id as "approvedByAdminId",
        t.created_at as "createdAt",
        t.updated_at as "updatedAt",
        a.referral_code as "artistReferralCode",
        fs.featured_tier as "featuredTier"
      FROM testimonials t
      LEFT JOIN artists a ON t.artist_id = a.id
      INNER JOIN featured_subscriptions fs ON t.id = fs.testimonial_id
      WHERE t.is_active = true
        AND (fs.end_date IS NULL OR fs.end_date > NOW())
        AND (fs.subscription_status IS NULL OR fs.subscription_status = 'active')
      ORDER BY 
        CASE fs.featured_tier
          WHEN 'admin_override' THEN 1
          WHEN 'premium' THEN 2
          WHEN 'merit' THEN 3
          ELSE 4
        END,
        t.display_order ASC,
        t.created_at ASC
    `;
    
    const results = await db.execute(query);
    
    // Results now have properly camelCased column names from the SQL aliases
    return results.rows as any[];
  }

  // Featured Subscription methods
  async createFeaturedSubscription(subscription: InsertFeaturedSubscription): Promise<FeaturedSubscription> {
    const [created] = await db.insert(featuredSubscriptions).values([subscription]).returning();
    return created;
  }

  async updateFeaturedSubscription(id: string, updates: Partial<FeaturedSubscription>): Promise<FeaturedSubscription> {
    const [updated] = await db
      .update(featuredSubscriptions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(featuredSubscriptions.id, id))
      .returning();
    return updated;
  }

  async getFeaturedSubscriptionsByArtist(artistId: string): Promise<FeaturedSubscription[]> {
    return await db
      .select()
      .from(featuredSubscriptions)
      .where(eq(featuredSubscriptions.artistId, artistId));
  }

  async getActiveFeaturedSubscriptions(): Promise<FeaturedSubscription[]> {
    return await db
      .select()
      .from(featuredSubscriptions)
      .where(isNull(featuredSubscriptions.endDate));
  }

  async getActiveFeaturedSubscriptionByArtist(artistId: string): Promise<FeaturedSubscription | undefined> {
    const [subscription] = await db
      .select()
      .from(featuredSubscriptions)
      .where(and(
        eq(featuredSubscriptions.artistId, artistId),
        isNull(featuredSubscriptions.endDate)
      ))
      .limit(1);
    return subscription;
  }

  async getFeaturedSlotsByTier(tier: string): Promise<FeaturedSubscription[]> {
    return await db
      .select()
      .from(featuredSubscriptions)
      .where(and(
        eq(featuredSubscriptions.featuredTier, tier as FeaturedTier),
        isNull(featuredSubscriptions.endDate)
      ));
  }

  async getFeaturedSubscriptionByStripeId(stripeSubscriptionId: string): Promise<FeaturedSubscription | undefined> {
    const [subscription] = await db
      .select()
      .from(featuredSubscriptions)
      .where(eq(featuredSubscriptions.stripeSubscriptionId, stripeSubscriptionId))
      .limit(1);
    return subscription;
  }

  async endFeaturedSubscription(id: string, endDate: Date, endReason: string): Promise<FeaturedSubscription> {
    const [updated] = await db
      .update(featuredSubscriptions)
      .set({ endDate, endReason, updatedAt: new Date() })
      .where(eq(featuredSubscriptions.id, id))
      .returning();
    return updated;
  }

  async createAdminOverride(testimonialId: string, adminId: string): Promise<{ subscription: FeaturedSubscription; totalSlots: number }> {
    // 1. Check if testimonial exists and get artist ID
    const [testimonial] = await db
      .select()
      .from(testimonials)
      .where(eq(testimonials.id, testimonialId))
      .limit(1);
    
    if (!testimonial) {
      throw new Error("Testimonial not found");
    }
    
    if (!testimonial.artistId) {
      throw new Error("Testimonial must be linked to an artist account");
    }
    
    // 2. Check for existing active subscription (conflict check)
    const existingSubscription = await this.getActiveFeaturedSubscriptionByArtist(testimonial.artistId);
    if (existingSubscription) {
      throw new Error(`Artist already has active ${existingSubscription.featuredTier} subscription`);
    }
    
    // 3. Count current active slots
    const activeSlots = await db
      .select()
      .from(featuredSubscriptions)
      .where(isNull(featuredSubscriptions.endDate));
    
    const totalSlots = activeSlots.length;
    
    // 4. Enforce 7-slot cap (warn but allow admin override priority)
    if (totalSlots >= 7) {
      console.warn(`[Admin Override] Creating admin override with ${totalSlots}/7 slots already filled`);
    }
    
    // 5. Create featured subscription
    const [subscription] = await db
      .insert(featuredSubscriptions)
      .values({
        id: randomUUID(),
        testimonialId,
        artistId: testimonial.artistId,
        featuredTier: "admin_override",
        startDate: new Date(),
        endDate: null,
        endReason: null,
        stripeSubscriptionId: null,
        stripeSubscriptionStatus: null,
        rank: null,
        artistEarnings: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    
    // 6. Update testimonial featuredTier
    await db
      .update(testimonials)
      .set({ featuredTier: "admin_override" })
      .where(eq(testimonials.id, testimonialId));
    
    // 7. Log action
    await this.logFeaturedRotation({
      rotationDate: new Date(),
      testimonialId,
      artistId: testimonial.artistId,
      featuredTier: "admin_override",
      artistEarnings: "0",
      rank: undefined,
      action: "override_add",
      reason: `Admin override by admin ${adminId}`,
    });
    
    return { subscription, totalSlots: totalSlots + 1 };
  }

  async removeAdminOverride(subscriptionId: string, adminId: string, reason?: string): Promise<void> {
    // 1. Get subscription to ensure it's admin_override
    const [subscription] = await db
      .select()
      .from(featuredSubscriptions)
      .where(eq(featuredSubscriptions.id, subscriptionId))
      .limit(1);
    
    if (!subscription) {
      throw new Error("Subscription not found");
    }
    
    if (subscription.featuredTier !== "admin_override") {
      throw new Error("Can only remove admin_override subscriptions through this endpoint");
    }
    
    // 2. End subscription
    await this.endFeaturedSubscription(
      subscriptionId,
      new Date(),
      reason || `Removed by admin ${adminId}`
    );
    
    // 3. Clear testimonial featuredTier
    await db
      .update(testimonials)
      .set({ featuredTier: null })
      .where(eq(testimonials.id, subscription.testimonialId));
    
    // 4. Log action
    await this.logFeaturedRotation({
      rotationDate: new Date(),
      testimonialId: subscription.testimonialId,
      artistId: subscription.artistId,
      featuredTier: "admin_override",
      artistEarnings: "0",
      rank: undefined,
      action: "override_remove",
      reason: reason || `Removed by admin ${adminId}`,
    });
  }

  async getFeaturedPlacementsOverview(): Promise<{
    totalSlots: number;
    slotsByTier: { admin_override: number; premium: number; merit: number };
    placements: Array<{
      id: string;
      testimonialId: string;
      artistId: string;
      artistName: string;
      testimonialTitle: string;
      featuredTier: string;
      startDate: Date;
      endDate: Date | null;
      stripeSubscriptionId?: string;
      stripeSubscriptionStatus?: string;
      rank?: number;
      monthlyEarnings?: string;
    }>;
    nextRotationDate?: Date;
  }> {
    // 1. Get all active featured subscriptions with testimonial and artist data
    const results = await db
      .select({
        subscription: featuredSubscriptions,
        testimonialTitle: testimonials.title,
        artistName: artists.name,
      })
      .from(featuredSubscriptions)
      .leftJoin(testimonials, eq(featuredSubscriptions.testimonialId, testimonials.id))
      .leftJoin(artists, eq(featuredSubscriptions.artistId, artists.id))
      .where(isNull(featuredSubscriptions.endDate))
      .orderBy(
        drizzleSql`CASE ${featuredSubscriptions.featuredTier}
          WHEN 'admin_override' THEN 1
          WHEN 'premium' THEN 2
          WHEN 'merit' THEN 3
          ELSE 4
        END`,
        featuredSubscriptions.startDate
      );
    
    // 2. Transform and count slots by tier
    const placements = results.map(r => ({
      id: r.subscription.id,
      testimonialId: r.subscription.testimonialId,
      artistId: r.subscription.artistId,
      artistName: r.artistName || "Unknown",
      testimonialTitle: r.testimonialTitle || "Untitled",
      featuredTier: r.subscription.featuredTier,
      startDate: r.subscription.startDate,
      endDate: r.subscription.endDate,
      stripeSubscriptionId: r.subscription.stripeSubscriptionId || undefined,
      stripeSubscriptionStatus: r.subscription.stripeSubscriptionStatus || undefined,
      rank: r.subscription.rank || undefined,
      monthlyEarnings: r.subscription.artistEarnings || undefined,
    }));
    
    const slotsByTier = {
      admin_override: placements.filter(p => p.featuredTier === "admin_override").length,
      premium: placements.filter(p => p.featuredTier === "premium").length,
      merit: placements.filter(p => p.featuredTier === "merit").length,
    };
    
    // 3. Calculate next rotation date (first day of next month)
    const now = new Date();
    const nextRotation = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    
    return {
      totalSlots: placements.length,
      slotsByTier,
      placements,
      nextRotationDate: nextRotation,
    };
  }

  async getFeaturedTestimonials(): Promise<Array<{
    testimonial: Testimonial;
    tier: string;
    status?: string;
    activeUntil?: Date | null;
    tierPriority: number;
  }>> {
    const now = new Date();
    const results = await db
      .select({
        testimonial: testimonials,
        tier: featuredSubscriptions.featuredTier,
        status: featuredSubscriptions.subscriptionStatus,
        activeUntil: featuredSubscriptions.expiresAt,
        tierPriority: featuredSubscriptions.tierPriority,
      })
      .from(featuredSubscriptions)
      .innerJoin(testimonials, eq(featuredSubscriptions.testimonialId, testimonials.id))
      .where(and(
        isNull(featuredSubscriptions.endDate), // Active subscription
        eq(testimonials.isActive, true) // Active testimonial
      ))
      .orderBy(asc(featuredSubscriptions.tierPriority));

    return results.map(r => ({
      testimonial: r.testimonial,
      tier: r.tier || '',
      status: r.status || undefined,
      activeUntil: r.activeUntil,
      tierPriority: r.tierPriority || 50,
    }));
  }

  async logFeaturedRotation(log: {
    rotationDate: Date;
    testimonialId: string;
    artistId: string;
    featuredTier: string;
    artistEarnings: string;
    rank?: number;
    action: string;
    reason?: string;
  }): Promise<FeaturedRotationLog> {
    const [created] = await db.insert(featuredRotationLog).values([log]).returning();
    return created;
  }

  async getTopEarningArtistsForRotation(limit: number, minEarnings: number): Promise<Array<{
    artistId: string;
    artistName: string;
    testimonialId: string | null;
    monthlyEarnings: string;
    totalEarnings: string;
    rank: number;
  }>> {
    // Step 1: Get top earning artists (deduplicated by artist ID)
    // Query 3x limit to account for artists without testimonials
    const candidateLimit = limit * 3;
    const topArtists = await db
      .select({
        artistId: artists.id,
        artistName: artists.name,
        monthlyEarnings: artists.monthlySales,
        totalLifetimeEarnings: drizzleSql<string>`COALESCE(SUM(${salesTable.totalEarnings}), 0)::text`,
      })
      .from(artists)
      .leftJoin(salesTable, eq(artists.id, salesTable.artistId))
      .where(and(
        isNull(artists.deletedAt),
        drizzleSql`(${artists.monthlySales})::numeric >= ${minEarnings}` // Cast to numeric for proper comparison
      ))
      .groupBy(artists.id, artists.name, artists.monthlySales, artists.createdAt)
      .orderBy(
        drizzleSql`(${artists.monthlySales})::numeric DESC`, // Primary: monthly sales (numeric sort)
        drizzleSql`SUM(${salesTable.totalEarnings}) DESC`, // Tie-break 1: lifetime earnings
        asc(artists.createdAt) // Tie-break 2: earliest signup
      )
      .limit(candidateLimit);

    // Step 2: For each artist, get their first active testimonial (if any)
    // Only include artists who have at least one active testimonial
    const results = await Promise.all(
      topArtists.map(async (artist) => {
        const [testimonial] = await db
          .select({ id: testimonials.id })
          .from(testimonials)
          .where(and(
            eq(testimonials.artistId, artist.artistId),
            eq(testimonials.isActive, true)
          ))
          .orderBy(desc(testimonials.createdAt)) // Pick most recent testimonial
          .limit(1);

        return {
          ...artist,
          testimonialId: testimonial?.id || null,
        };
      })
    );

    // Step 3: Filter to only artists with testimonials, take first N, and add ranking
    const eligibleArtists = results
      .filter(r => r.testimonialId !== null)
      .slice(0, limit) // Take exactly `limit` artists with testimonials
      .map((r, index) => ({
        artistId: r.artistId,
        artistName: r.artistName,
        testimonialId: r.testimonialId,
        monthlyEarnings: r.monthlyEarnings,
        totalEarnings: r.totalLifetimeEarnings || '0',
        rank: index + 1, // 1-based ranking
      }));

    return eligibleArtists;
  }

  // ===================================
  // INFLUENCER AFFILIATE PROGRAM IMPLEMENTATION
  // ===================================

  async getInfluencer(id: string): Promise<Influencer | undefined> {
    const [influencer] = await db
      .select()
      .from(influencers)
      .where(eq(influencers.id, id))
      .limit(1);
    return influencer;
  }

  async getInfluencerByEmail(email: string): Promise<Influencer | undefined> {
    const [influencer] = await db
      .select()
      .from(influencers)
      .where(eq(influencers.email, email))
      .limit(1);
    return influencer;
  }

  async getInfluencerByAffiliateCode(affiliateCode: string): Promise<Influencer | undefined> {
    const [influencer] = await db
      .select()
      .from(influencers)
      .where(eq(influencers.affiliateCode, affiliateCode))
      .limit(1);
    return influencer;
  }

  async getAllInfluencers(filters?: { status?: string; search?: string }): Promise<Influencer[]> {
    let query = db.select().from(influencers);

    const conditions = [];
    if (filters?.status) {
      conditions.push(eq(influencers.status, filters.status));
    }
    if (filters?.search) {
      // Search by name or email (case-insensitive)
      const searchPattern = `%${filters.search}%`;
      conditions.push(
        drizzleSql`${influencers.name} ILIKE ${searchPattern} OR ${influencers.email} ILIKE ${searchPattern}`
      );
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const results = await query.orderBy(desc(influencers.createdAt));
    return results;
  }

  async createInfluencer(influencer: InsertInfluencer): Promise<Influencer> {
    const [created] = await db.insert(influencers).values([influencer]).returning();
    return created;
  }

  async updateInfluencer(id: string, updates: Partial<Influencer>): Promise<Influencer> {
    const [updated] = await db
      .update(influencers)
      .set(updates)
      .where(eq(influencers.id, id))
      .returning();
    return updated;
  }

  async approveInfluencer(id: string): Promise<Influencer> {
    const [approved] = await db
      .update(influencers)
      .set({ 
        status: "active",
        approvedAt: new Date()
      })
      .where(eq(influencers.id, id))
      .returning();
    return approved;
  }

  async createAffiliateClick(click: InsertAffiliateClick): Promise<AffiliateClick> {
    const [created] = await db.insert(affiliateClicks).values([click]).returning();
    return created;
  }

  async createAffiliateConversion(conversion: InsertAffiliateConversion): Promise<AffiliateConversion> {
    const [created] = await db.insert(affiliateConversions).values([conversion]).returning();
    return created;
  }

  async getInfluencerPerformanceSummary(influencerId: string): Promise<{
    totalClicks: number;
    totalConversions: number;
    conversionRate: number;
    totalEarnings: string;
    pendingEarnings: string;
    monthlySalesCount: number;
    currentTier: string;
  }> {
    // Get influencer for tier info
    const influencer = await this.getInfluencer(influencerId);
    if (!influencer) {
      throw new Error("Influencer not found");
    }

    // Count total clicks
    const clicksResult = await db
      .select({ count: drizzleSql<number>`count(*)::int` })
      .from(affiliateClicks)
      .where(eq(affiliateClicks.influencerId, influencerId));
    const totalClicks = clicksResult[0]?.count || 0;

    // Count total conversions and earnings
    const conversionsResult = await db
      .select({ 
        count: drizzleSql<number>`count(*)::int`,
        totalEarnings: sum(affiliateConversions.totalPayout),
        pendingEarnings: sum(drizzleSql`CASE WHEN ${affiliateConversions.payoutStatus} = 'pending' THEN ${affiliateConversions.totalPayout} ELSE 0 END`)
      })
      .from(affiliateConversions)
      .where(eq(affiliateConversions.influencerId, influencerId));
    
    const totalConversions = conversionsResult[0]?.count || 0;
    const totalEarnings = conversionsResult[0]?.totalEarnings || '0';
    const pendingEarnings = conversionsResult[0]?.pendingEarnings || '0';

    // Count monthly sales (for tier calculation)
    const firstOfMonth = new Date();
    firstOfMonth.setDate(1);
    firstOfMonth.setHours(0, 0, 0, 0);

    const monthlySalesResult = await db
      .select({ count: drizzleSql<number>`count(*)::int` })
      .from(affiliateConversions)
      .where(and(
        eq(affiliateConversions.influencerId, influencerId),
        gte(affiliateConversions.createdAt, firstOfMonth)
      ));
    const monthlySalesCount = monthlySalesResult[0]?.count || 0;

    // Calculate conversion rate
    const conversionRate = totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0;

    return {
      totalClicks,
      totalConversions,
      conversionRate: Math.round(conversionRate * 100) / 100, // Round to 2 decimals
      totalEarnings: totalEarnings.toString(),
      pendingEarnings: pendingEarnings.toString(),
      monthlySalesCount,
      currentTier: influencer.currentTier,
    };
  }

  async getInfluencerConversionStats(influencerId: string): Promise<{
    totalConversions: number;
    totalClicks: number;
    totalEarnings: string;
    conversionRate: number;
    artistsRecruited: number;
    firstConversionDate: Date | null;
  }> {
    // Count total clicks
    const clicksResult = await db
      .select({ count: drizzleSql<number>`count(*)::int` })
      .from(affiliateClicks)
      .where(eq(affiliateClicks.influencerId, influencerId));
    const totalClicks = clicksResult[0]?.count || 0;

    // Get all conversions for this influencer
    const conversions = await db
      .select()
      .from(affiliateConversions)
      .where(eq(affiliateConversions.influencerId, influencerId))
      .orderBy(asc(affiliateConversions.createdAt));

    const totalConversions = conversions.length;
    const totalEarnings = conversions.reduce((sum, c) => sum + parseFloat((c.totalPayout || 0).toString()), 0);
    const conversionRate = totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0;
    
    // Count artists recruited (conversions with type 'artist_signup')
    const artistsRecruited = conversions.filter(c => c.conversionType === 'artist_signup').length;

    // Get first conversion date
    const firstConversionDate = conversions.length > 0 ? new Date(conversions[0].createdAt) : null;

    return {
      totalConversions,
      totalClicks,
      totalEarnings: totalEarnings.toString(),
      conversionRate: Math.round(conversionRate * 100) / 100,
      artistsRecruited,
      firstConversionDate,
    };
  }

  async getRecentConversionsCount(influencerId: string, hours: number): Promise<number> {
    const hoursAgo = new Date();
    hoursAgo.setHours(hoursAgo.getHours() - hours);

    const result = await db
      .select({ count: drizzleSql<number>`count(*)::int` })
      .from(affiliateConversions)
      .where(and(
        eq(affiliateConversions.influencerId, influencerId),
        gte(affiliateConversions.createdAt, hoursAgo)
      ));

    return result[0]?.count || 0;
  }

  // ====================
  // GAMIFICATION METHODS
  // ====================

  async getLeaderboard(metric: string, period: string): Promise<Array<{
    influencerId: string;
    influencerName: string;
    avatarUrl?: string;
    currentTier: string;
    score: number;
    rank: number;
  }>> {
    // Build query based on metric and period
    let periodFilter;
    if (period === 'monthly') {
      const firstOfMonth = new Date();
      firstOfMonth.setDate(1);
      firstOfMonth.setHours(0, 0, 0, 0);
      periodFilter = gte(affiliateConversions.createdAt, firstOfMonth);
    } else if (period === 'weekly') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      periodFilter = gte(affiliateConversions.createdAt, weekAgo);
    }

    const results = await db
      .select({
        influencerId: influencers.id,
        influencerName: influencers.name,
        currentTier: influencers.currentTier,
        score: metric === 'earnings' 
          ? sum(affiliateConversions.totalPayout)
          : drizzleSql<number>`count(*)::int`
      })
      .from(influencers)
      .leftJoin(affiliateConversions, eq(influencers.id, affiliateConversions.influencerId))
      .where(and(
        eq(influencers.status, 'active'),
        periodFilter ? periodFilter : undefined
      ))
      .groupBy(influencers.id, influencers.name, influencers.currentTier)
      .orderBy(drizzleSql`${metric === 'earnings' ? sum(affiliateConversions.totalPayout) : drizzleSql<number>`count(*)`} DESC NULLS LAST`)
      .limit(100);

    return results.map((r, index) => ({
      influencerId: r.influencerId,
      influencerName: r.influencerName,
      currentTier: r.currentTier,
      score: typeof r.score === 'string' ? parseFloat(r.score) : r.score || 0,
      rank: index + 1
    }));
  }

  async getInfluencerBadges(influencerId: string): Promise<Array<{
    achievementId: string;
    code: string;
    name: string;
    description: string;
    icon: string;
    category: string;
    rarity: string;
    points: number;
    unlockedAt: Date;
  }>> {
    const badges = await db
      .select({
        achievementId: achievements.id,
        code: achievements.code,
        name: achievements.name,
        description: achievements.description,
        icon: achievements.icon,
        category: achievements.category,
        rarity: achievements.rarity,
        points: achievements.points,
        unlockedAt: influencerAchievements.unlockedAt
      })
      .from(influencerAchievements)
      .innerJoin(achievements, eq(influencerAchievements.achievementId, achievements.id))
      .where(eq(influencerAchievements.influencerId, influencerId))
      .orderBy(influencerAchievements.unlockedAt);

    return badges;
  }

  async getAllAchievements(): Promise<Array<{
    id: string;
    code: string;
    name: string;
    description: string;
    icon: string;
    category: string;
    rarity: string;
    points: number;
    criteria: any;
  }>> {
    const allAchievements = await db
      .select()
      .from(achievements)
      .where(eq(achievements.isActive, true))
      .orderBy(achievements.points);

    return allAchievements;
  }

  async unlockAchievement(influencerId: string, achievementCode: string): Promise<void> {
    const [achievement] = await db
      .select()
      .from(achievements)
      .where(eq(achievements.code, achievementCode))
      .limit(1);

    if (!achievement) {
      throw new Error("Achievement not found");
    }

    // Check if already unlocked
    const [existing] = await db
      .select()
      .from(influencerAchievements)
      .where(and(
        eq(influencerAchievements.influencerId, influencerId),
        eq(influencerAchievements.achievementId, achievement.id)
      ))
      .limit(1);

    if (existing) {
      return; // Already unlocked
    }

    // Unlock the achievement
    await db.insert(influencerAchievements).values({
      influencerId,
      achievementId: achievement.id
    });

    // Create activity feed event
    const influencer = await this.getInfluencer(influencerId);
    if (influencer) {
      await db.insert(activityFeedEvents).values({
        influencerId,
        eventType: 'achievement_unlocked',
        eventData: { achievementCode, achievementName: achievement.name },
        message: `${achievement.icon} ${influencer.name} unlocked "${achievement.name}"!`,
        isPublic: true
      });
    }
  }

  async getActiveChallenges(): Promise<Array<{
    id: string;
    name: string;
    description: string;
    challengeType: string;
    metric: string;
    goal?: string;
    startDate: Date;
    endDate: Date;
    firstPlacePrize: string;
    secondPlacePrize?: string;
    thirdPlacePrize?: string;
    prizeDescription?: string;
    status: string;
    participantCount: number;
  }>> {
    const activeChallenges = await db
      .select({
        id: challenges.id,
        name: challenges.name,
        description: challenges.description,
        challengeType: challenges.challengeType,
        metric: challenges.metric,
        goal: challenges.goal,
        startDate: challenges.startDate,
        endDate: challenges.endDate,
        firstPlacePrize: challenges.firstPlacePrize,
        secondPlacePrize: challenges.secondPlacePrize,
        thirdPlacePrize: challenges.thirdPlacePrize,
        prizeDescription: challenges.prizeDescription,
        status: challenges.status,
        participantCount: drizzleSql<number>`count(${challengeParticipants.id})::int`
      })
      .from(challenges)
      .leftJoin(challengeParticipants, eq(challenges.id, challengeParticipants.challengeId))
      .where(drizzleSql`${challenges.status} IN ('upcoming', 'active')`)
      .groupBy(
        challenges.id,
        challenges.name,
        challenges.description,
        challenges.challengeType,
        challenges.metric,
        challenges.goal,
        challenges.startDate,
        challenges.endDate,
        challenges.firstPlacePrize,
        challenges.secondPlacePrize,
        challenges.thirdPlacePrize,
        challenges.prizeDescription,
        challenges.status
      )
      .orderBy(challenges.startDate);

    return activeChallenges.map(c => ({
      ...c,
      goal: c.goal?.toString(),
      firstPlacePrize: c.firstPlacePrize.toString(),
      secondPlacePrize: c.secondPlacePrize?.toString(),
      thirdPlacePrize: c.thirdPlacePrize?.toString(),
      participantCount: c.participantCount || 0
    }));
  }

  async createChallenge(challenge: {
    name: string;
    description: string;
    challengeType: string;
    metric: string;
    goal: string | null;
    startDate: Date;
    endDate: Date;
    firstPlacePrize: string;
    secondPlacePrize: string | null;
    thirdPlacePrize: string | null;
    prizeDescription: string | null;
    status: string;
  }): Promise<any> {
    const [newChallenge] = await db.insert(challenges).values(challenge).returning();
    return newChallenge;
  }

  async updateChallengeStatus(challengeId: string, status: string): Promise<void> {
    await db
      .update(challenges)
      .set({ status })
      .where(eq(challenges.id, challengeId));
  }

  async joinChallenge(challengeId: string, influencerId: string): Promise<void> {
    // Check if already joined
    const [existing] = await db
      .select()
      .from(challengeParticipants)
      .where(and(
        eq(challengeParticipants.challengeId, challengeId),
        eq(challengeParticipants.influencerId, influencerId)
      ))
      .limit(1);

    if (existing) {
      throw new Error("Already joined this challenge");
    }

    // Join the challenge
    await db.insert(challengeParticipants).values({
      challengeId,
      influencerId,
      currentScore: '0'
    });
  }

  async getChallengeLeaderboard(challengeId: string): Promise<Array<{
    influencerId: string;
    influencerName: string;
    currentScore: string;
    rank?: number;
  }>> {
    const participants = await db
      .select({
        influencerId: challengeParticipants.influencerId,
        influencerName: influencers.name,
        currentScore: challengeParticipants.currentScore,
        rank: challengeParticipants.rank
      })
      .from(challengeParticipants)
      .innerJoin(influencers, eq(challengeParticipants.influencerId, influencers.id))
      .where(eq(challengeParticipants.challengeId, challengeId))
      .orderBy(challengeParticipants.currentScore);

    return participants.map(p => ({
      ...p,
      currentScore: p.currentScore.toString()
    }));
  }

  async getActivityFeed(limit: number): Promise<Array<{
    id: string;
    influencerId: string;
    influencerName: string;
    eventType: string;
    eventData: any;
    message: string;
    createdAt: Date;
  }>> {
    const events = await db
      .select({
        id: activityFeedEvents.id,
        influencerId: activityFeedEvents.influencerId,
        influencerName: influencers.name,
        eventType: activityFeedEvents.eventType,
        eventData: activityFeedEvents.eventData,
        message: activityFeedEvents.message,
        createdAt: activityFeedEvents.createdAt
      })
      .from(activityFeedEvents)
      .innerJoin(influencers, eq(activityFeedEvents.influencerId, influencers.id))
      .where(eq(activityFeedEvents.isPublic, true))
      .orderBy(activityFeedEvents.createdAt)
      .limit(limit);

    return events;
  }
}

// In-memory storage implementation (fallback)
class MemStorage implements IStorage {
  private artists: Map<string, Artist> = new Map();
  private admins: Map<string, Admin> = new Map();
  private portfolioSubmissions: Map<string, PortfolioSubmission> = new Map();
  private violationReports: Map<string, ViolationReport> = new Map();
  private artworks: Map<string, Artwork> = new Map();

  async getArtist(id: string): Promise<Artist | undefined> {
    const artist = this.artists.get(id);
    // Filter out deleted artists
    if (artist?.deletedAt) {
      return undefined;
    }
    return artist;
  }

  async getArtistByEmail(email: string): Promise<Artist | undefined> {
    const artist = Array.from(this.artists.values()).find((a) => a.email === email);
    // Filter out deleted artists
    if (artist?.deletedAt) {
      return undefined;
    }
    return artist;
  }

  async getAllArtists(): Promise<Artist[]> {
    return Array.from(this.artists.values())
      .filter((a) => !a.deletedAt)
      .sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  }

  async createArtist(insertArtist: InsertArtist): Promise<Artist> {
    const id = randomUUID();
    const referralCode = generateReferralCode(insertArtist.name);
    const artist: Artist = {
      ...insertArtist,
      id,
      referralCode,
      approved: false,
      monthlySales: '0',
      stripeAccountId: null,
      stripeAccountStatus: null,
      stripeOnboardingComplete: false,
      stripeDetailsSubmitted: false,
      stripeChargesEnabled: false,
      stripePayoutsEnabled: false,
      stripeRequirements: null,
      stripeAccountLinkExpiresAt: null,
      stripeDefaultCurrency: null,
      externalAccountLast4: null,
      referredBy: null,
      referralSource: null,
      tosAcceptedAt: null,
      tosIpAddress: null,
      tosVersion: null,
      deletedAt: null,
      createdAt: new Date(),
    };
    this.artists.set(id, artist);
    return artist;
  }

  async updateArtist(id: string, updates: Partial<Artist>): Promise<Artist> {
    const artist = this.artists.get(id);
    if (!artist) throw new Error("Artist not found");
    const updated = { ...artist, ...updates };
    this.artists.set(id, updated);
    return updated;
  }

  async deleteArtist(id: string): Promise<Artist> {
    const artist = this.artists.get(id);
    if (!artist) throw new Error("Artist not found");
    const deleted = { ...artist, deletedAt: new Date() };
    this.artists.set(id, deleted);
    return deleted;
  }

  async getAdmin(id: string): Promise<Admin | undefined> {
    return this.admins.get(id);
  }

  async getAdminByEmail(email: string): Promise<Admin | undefined> {
    return Array.from(this.admins.values()).find((a) => a.email === email);
  }

  async createAdmin(insertAdmin: InsertAdmin): Promise<Admin> {
    const id = randomUUID();
    const admin: Admin = {
      ...insertAdmin,
      id,
      createdAt: new Date(),
    };
    this.admins.set(id, admin);
    return admin;
  }

  async updateAdmin(id: string, updates: Partial<Admin>): Promise<Admin> {
    const admin = this.admins.get(id);
    if (!admin) throw new Error("Admin not found");
    const updated = { ...admin, ...updates };
    this.admins.set(id, updated);
    return updated;
  }

  // Password Reset Token methods (in-memory stub - not functional)
  async createPasswordResetToken(email: string, hashedToken: string, userType: 'artist' | 'admin', expiresAt: Date): Promise<PasswordResetToken> {
    console.warn("MemStorage: Password reset not supported in memory mode");
    throw new Error("Password reset requires database configuration");
  }

  async getPasswordResetToken(hashedToken: string): Promise<PasswordResetToken | undefined> {
    console.warn("MemStorage: Password reset not supported in memory mode");
    return undefined;
  }

  async markTokenAsUsed(hashedToken: string): Promise<void> {
    console.warn("MemStorage: Password reset not supported in memory mode");
  }

  async invalidateUserTokens(email: string, userType: 'artist' | 'admin'): Promise<void> {
    console.warn("MemStorage: Password reset not supported in memory mode");
  }

  async createPortfolioSubmission(submission: InsertPortfolioSubmission): Promise<PortfolioSubmission> {
    const id = randomUUID();
    const portfolioSubmission: PortfolioSubmission = {
      ...submission,
      id,
      createdAt: new Date(),
    };
    this.portfolioSubmissions.set(id, portfolioSubmission);
    return portfolioSubmission;
  }

  async getPortfolioSubmissionsByArtist(artistId: string): Promise<PortfolioSubmission[]> {
    return Array.from(this.portfolioSubmissions.values())
      .filter((s) => s.artistId === artistId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async createViolationReport(report: InsertViolationReport): Promise<ViolationReport> {
    const id = randomUUID();
    const violationReport: ViolationReport = {
      ...report,
      id,
      notes: report.notes || null,
      status: report.status || "pending",
      resolvedAt: null,
      resolutionNotes: null,
      createdAt: new Date(),
    };
    this.violationReports.set(id, violationReport);
    return violationReport;
  }

  async getViolationReportsByArtwork(artworkId: string): Promise<ViolationReport[]> {
    return Array.from(this.violationReports.values())
      .filter((r) => r.artworkId === artworkId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async getAllViolationReports(): Promise<ViolationReport[]> {
    return Array.from(this.violationReports.values())
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  async getArtwork(id: string): Promise<Artwork | undefined> {
    return this.artworks.get(id);
  }

  async getArtworksByArtist(artistId: string): Promise<Artwork[]> {
    return Array.from(this.artworks.values())
      .filter((a) => a.artistId === artistId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getAllArtworks(): Promise<ArtworkWithArtist[]> {
    const artworks = Array.from(this.artworks.values());
    return Promise.all(
      artworks.map(async (artwork) => {
        const artist = await this.getArtist(artwork.artistId);
        return {
          ...artwork,
          artist: {
            id: artist!.id,
            name: artist!.name,
            email: artist!.email,
          },
        };
      })
    );
  }

  async createArtwork(insertArtwork: InsertArtwork): Promise<Artwork> {
    const id = randomUUID();
    const artwork: Artwork = {
      ...insertArtwork,
      id,
      description: insertArtwork.description ?? null,
      status: "pending",
      rejectionReason: null,
      ipDeclarationText: null,
      shopifyProductId: null,
      shopifyProductStatus: "draft",
      printifyProductId: null,
      printifyImageId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.artworks.set(id, artwork);
    return artwork;
  }

  async updateArtwork(id: string, updates: Partial<Artwork>): Promise<Artwork> {
    const artwork = this.artworks.get(id);
    if (!artwork) throw new Error("Artwork not found");
    const updated = { ...artwork, ...updates, updatedAt: new Date() };
    this.artworks.set(id, updated);
    return updated;
  }

  // MVP Order/Sale methods - stub implementations (log only)
  async createOrder(order: any): Promise<any> {
    console.log("MemStorage: createOrder called (stub)", order);
    return { id: randomUUID(), ...order };
  }

  async updateOrder(id: string, updates: any): Promise<any> {
    console.log("MemStorage: updateOrder called (stub)", id, updates);
    return { id, ...updates };
  }

  async getAllOrders(): Promise<any[]> {
    console.log("MemStorage: getAllOrders called (stub)");
    return [];
  }

  async createSale(sale: any): Promise<any> {
    console.log("MemStorage: createSale called (stub)", sale);
    return { id: randomUUID(), ...sale };
  }

  async getSalesByArtist(artistId: string): Promise<any[]> {
    console.log("MemStorage: getSalesByArtist called (stub)", artistId);
    return [];
  }

  async updateSale(id: string, updates: any): Promise<any> {
    console.log("MemStorage: updateSale called (stub)", id, updates);
    return { id, ...updates };
  }

  async createPayout(payout: any): Promise<any> {
    console.log("MemStorage: createPayout called (stub)", payout);
    return { id: randomUUID(), ...payout };
  }

  async updatePayout(id: string, updates: any): Promise<any> {
    console.log("MemStorage: updatePayout called (stub)", id, updates);
    return { id, ...updates };
  }

  async getPayoutsByArtist(artistId: string): Promise<any[]> {
    console.log("MemStorage: getPayoutsByArtist called (stub)", artistId);
    return [];
  }

  async getPendingPayouts(): Promise<any[]> {
    console.log("MemStorage: getPendingPayouts called (stub)");
    return [];
  }

  async getAllPayouts(): Promise<any[]> {
    console.log("MemStorage: getAllPayouts called (stub)");
    return [];
  }

  async createStripeWebhookEvent(event: InsertStripeWebhookEvent): Promise<StripeWebhookEvent> {
    console.log("MemStorage: createStripeWebhookEvent called (stub)", event);
    return {
      id: randomUUID(),
      ...event,
      eventId: event.eventId,
      eventType: event.eventType,
      status: event.status || "pending",
      payload: event.payload || null,
      errorMessage: event.errorMessage || null,
      processedAt: event.processedAt || null,
      createdAt: new Date(),
    };
  }

  async getStripeWebhookEvent(eventId: string): Promise<StripeWebhookEvent | undefined> {
    console.log("MemStorage: getStripeWebhookEvent called (stub)", eventId);
    return undefined;
  }

  async updateStripeWebhookEvent(id: string, updates: Partial<StripeWebhookEvent>): Promise<StripeWebhookEvent> {
    console.log("MemStorage: updateStripeWebhookEvent called (stub)", id, updates);
    return {
      id,
      eventId: "evt_test",
      eventType: "account.updated",
      status: "processed",
      payload: null,
      errorMessage: null,
      processedAt: new Date(),
      createdAt: new Date(),
      ...updates,
    };
  }

  async createTestimonial(testimonial: InsertTestimonial): Promise<Testimonial> {
    console.log("MemStorage: createTestimonial called (stub)", testimonial);
    return {
      id: randomUUID(),
      ...testimonial,
      earningsUsd: testimonial.earningsUsd || "0",
      productsCount: testimonial.productsCount || 0,
      featured: testimonial.featured || false,
      isActive: testimonial.isActive !== undefined ? testimonial.isActive : true,
      displayOrder: testimonial.displayOrder || 0,
      allowEmbed: testimonial.allowEmbed || false,
      artistConsent: testimonial.artistConsent || false,
      consentTimestamp: null, // Set server-side
      consentVersion: null, // Set server-side
      approvedByAdminId: null, // Set server-side
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Testimonial;
  }

  async updateTestimonial(id: string, updates: Partial<Testimonial>): Promise<Testimonial> {
    console.log("MemStorage: updateTestimonial called (stub)", id, updates);
    return {
      id,
      artistId: null,
      artistName: "Test Artist",
      title: "Test Testimonial",
      quote: "This is a test quote",
      videoProvider: "youtube",
      videoUrl: null,
      videoThumbnailUrl: null,
      localVideoPath: null,
      earningsUsd: "0",
      productsCount: 0,
      featured: false,
      isActive: true,
      displayOrder: 0,
      shareSlug: "test-slug",
      shareExcerpt: null,
      shareImageUrl: null,
      allowEmbed: false,
      artistConsent: false,
      consentTimestamp: null,
      consentVersion: null,
      approvedByAdminId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...updates,
    };
  }

  async deleteTestimonial(id: string): Promise<void> {
    console.log("MemStorage: deleteTestimonial called (stub)", id);
  }

  async getTestimonial(id: string): Promise<Testimonial | undefined> {
    console.log("MemStorage: getTestimonial called (stub)", id);
    return undefined;
  }

  async getTestimonialBySlug(slug: string): Promise<Testimonial | undefined> {
    console.log("MemStorage: getTestimonialBySlug called (stub)", slug);
    return undefined;
  }

  async getAllTestimonials(): Promise<Testimonial[]> {
    console.log("MemStorage: getAllTestimonials called (stub)");
    return [];
  }

  async getActiveTestimonials(limit?: number): Promise<Testimonial[]> {
    console.log("MemStorage: getActiveTestimonials called (stub)", limit);
    return [];
  }

  async reorderTestimonials(reorderedItems: Array<{ id: string; displayOrder: number }>): Promise<void> {
    console.log("MemStorage: reorderTestimonials called (stub)", reorderedItems);
  }

  async getAllTestimonialsWithArtist(): Promise<TestimonialWithArtist[]> {
    console.log("MemStorage: getAllTestimonialsWithArtist called (stub)");
    return [];
  }

  async getTestimonialBySlugWithArtist(slug: string): Promise<TestimonialWithArtist | undefined> {
    console.log("MemStorage: getTestimonialBySlugWithArtist called (stub)", slug);
    return undefined;
  }

  async getFeaturedTestimonialsWithArtist(): Promise<TestimonialWithArtist[]> {
    console.log("MemStorage: getFeaturedTestimonialsWithArtist called (stub)");
    return [];
  }

  async getArtistByReferralCode(referralCode: string): Promise<Artist | undefined> {
    console.log("MemStorage: getArtistByReferralCode called (stub)", referralCode);
    return undefined;
  }

  async createFeaturedSubscription(subscription: InsertFeaturedSubscription): Promise<FeaturedSubscription> {
    console.log("MemStorage: createFeaturedSubscription called (stub)", subscription);
    return {
      id: randomUUID(),
      ...subscription,
      tierPriority: subscription.tierPriority || 50,
      currentPeriodEnd: subscription.currentPeriodEnd || null,
      expiresAt: subscription.expiresAt || null,
      endReason: subscription.endReason || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as FeaturedSubscription;
  }

  async updateFeaturedSubscription(id: string, updates: Partial<FeaturedSubscription>): Promise<FeaturedSubscription> {
    console.log("MemStorage: updateFeaturedSubscription called (stub)", id, updates);
    return { id, ...updates } as FeaturedSubscription;
  }

  async getFeaturedSubscriptionsByArtist(artistId: string): Promise<FeaturedSubscription[]> {
    console.log("MemStorage: getFeaturedSubscriptionsByArtist called (stub)", artistId);
    return [];
  }

  async getActiveFeaturedSubscriptions(): Promise<FeaturedSubscription[]> {
    console.log("MemStorage: getActiveFeaturedSubscriptions called (stub)");
    return [];
  }

  async getActiveFeaturedSubscriptionByArtist(artistId: string): Promise<FeaturedSubscription | undefined> {
    console.log("MemStorage: getActiveFeaturedSubscriptionByArtist called (stub)", artistId);
    return undefined;
  }

  async getFeaturedSlotsByTier(tier: string): Promise<FeaturedSubscription[]> {
    console.log("MemStorage: getFeaturedSlotsByTier called (stub)", tier);
    return [];
  }

  async getFeaturedSubscriptionByStripeId(stripeSubscriptionId: string): Promise<FeaturedSubscription | undefined> {
    console.log("MemStorage: getFeaturedSubscriptionByStripeId called (stub)", stripeSubscriptionId);
    return undefined;
  }

  async endFeaturedSubscription(id: string, endDate: Date, endReason: string): Promise<FeaturedSubscription> {
    console.log("MemStorage: endFeaturedSubscription called (stub)", id, endDate, endReason);
    return { id, endDate, endReason } as FeaturedSubscription;
  }

  async createAdminOverride(testimonialId: string, adminId: string): Promise<{ subscription: FeaturedSubscription; totalSlots: number }> {
    console.log("MemStorage: createAdminOverride called (stub)", testimonialId, adminId);
    return { subscription: {} as FeaturedSubscription, totalSlots: 1 };
  }

  async removeAdminOverride(subscriptionId: string, adminId: string, reason?: string): Promise<void> {
    console.log("MemStorage: removeAdminOverride called (stub)", subscriptionId, adminId, reason);
  }

  async getFeaturedPlacementsOverview(): Promise<{
    totalSlots: number;
    slotsByTier: { admin_override: number; premium: number; merit: number };
    placements: Array<any>;
    nextRotationDate?: Date;
  }> {
    console.log("MemStorage: getFeaturedPlacementsOverview called (stub)");
    return {
      totalSlots: 0,
      slotsByTier: { admin_override: 0, premium: 0, merit: 0 },
      placements: [],
      nextRotationDate: new Date(),
    };
  }

  async getFeaturedTestimonials(): Promise<Array<{
    testimonial: Testimonial;
    tier: string;
    status?: string;
    activeUntil?: Date | null;
    tierPriority: number;
  }>> {
    console.log("MemStorage: getFeaturedTestimonials called (stub)");
    return [];
  }

  async logFeaturedRotation(log: {
    rotationDate: Date;
    testimonialId: string;
    artistId: string;
    featuredTier: string;
    artistEarnings: string;
    rank?: number;
    action: string;
    reason?: string;
  }): Promise<FeaturedRotationLog> {
    console.log("MemStorage: logFeaturedRotation called (stub)", log);
    return {
      id: randomUUID(),
      ...log,
      createdAt: new Date(),
    } as FeaturedRotationLog;
  }

  async getTopEarningArtistsForRotation(limit: number, minEarnings: number): Promise<Array<{
    artistId: string;
    artistName: string;
    testimonialId: string | null;
    monthlyEarnings: string;
    totalEarnings: string;
    rank: number;
  }>> {
    console.log("MemStorage: getTopEarningArtistsForRotation called (stub)", limit, minEarnings);
    return [];
  }

  // ===================================
  // INFLUENCER AFFILIATE PROGRAM STUBS
  // ===================================

  async getInfluencer(id: string): Promise<Influencer | undefined> {
    console.log("MemStorage: getInfluencer called (stub)", id);
    return undefined;
  }

  async getInfluencerByEmail(email: string): Promise<Influencer | undefined> {
    console.log("MemStorage: getInfluencerByEmail called (stub)", email);
    return undefined;
  }

  async getInfluencerByAffiliateCode(affiliateCode: string): Promise<Influencer | undefined> {
    console.log("MemStorage: getInfluencerByAffiliateCode called (stub)", affiliateCode);
    return undefined;
  }

  async getAllInfluencers(filters?: { status?: string; search?: string }): Promise<Influencer[]> {
    console.log("MemStorage: getAllInfluencers called (stub)", filters);
    return [];
  }

  async createInfluencer(influencer: InsertInfluencer): Promise<Influencer> {
    console.log("MemStorage: createInfluencer called (stub)", influencer);
    return { 
      id: randomUUID(), 
      ...influencer,
      currentTier: "bronze",
      status: influencer.status || "pending",
      createdAt: new Date()
    } as Influencer;
  }

  async updateInfluencer(id: string, updates: Partial<Influencer>): Promise<Influencer> {
    console.log("MemStorage: updateInfluencer called (stub)", id, updates);
    return { id, ...updates } as Influencer;
  }

  async approveInfluencer(id: string): Promise<Influencer> {
    console.log("MemStorage: approveInfluencer called (stub)", id);
    return { 
      id, 
      status: "active",
      approvedAt: new Date()
    } as Influencer;
  }

  async createAffiliateClick(click: InsertAffiliateClick): Promise<AffiliateClick> {
    console.log("MemStorage: createAffiliateClick called (stub)", click);
    return { id: randomUUID(), ...click, createdAt: new Date() } as AffiliateClick;
  }

  async createAffiliateConversion(conversion: InsertAffiliateConversion): Promise<AffiliateConversion> {
    console.log("MemStorage: createAffiliateConversion called (stub)", conversion);
    return { id: randomUUID(), ...conversion, createdAt: new Date() } as AffiliateConversion;
  }

  async getInfluencerPerformanceSummary(influencerId: string): Promise<{
    totalClicks: number;
    totalConversions: number;
    conversionRate: number;
    totalEarnings: string;
    pendingEarnings: string;
    monthlySalesCount: number;
    currentTier: string;
  }> {
    console.log("MemStorage: getInfluencerPerformanceSummary called (stub)", influencerId);
    return {
      totalClicks: 0,
      totalConversions: 0,
      conversionRate: 0,
      totalEarnings: '0',
      pendingEarnings: '0',
      monthlySalesCount: 0,
      currentTier: 'bronze',
    };
  }

  async getInfluencerConversionStats(influencerId: string): Promise<{
    totalConversions: number;
    totalClicks: number;
    totalEarnings: string;
    conversionRate: number;
    artistsRecruited: number;
    firstConversionDate: Date | null;
  }> {
    console.log("MemStorage: getInfluencerConversionStats called (stub)", influencerId);
    return {
      totalConversions: 0,
      totalClicks: 0,
      totalEarnings: '0',
      conversionRate: 0,
      artistsRecruited: 0,
      firstConversionDate: null,
    };
  }

  async getRecentConversionsCount(influencerId: string, hours: number): Promise<number> {
    console.log("MemStorage: getRecentConversionsCount called (stub)", influencerId, hours);
    return 0;
  }

  // Gamification stubs
  async getLeaderboard(): Promise<Array<any>> { return []; }
  async getInfluencerBadges(): Promise<Array<any>> { return []; }
  async getAllAchievements(): Promise<Array<any>> { return []; }
  async unlockAchievement(): Promise<void> {}
  async getActiveChallenges(): Promise<Array<any>> { return []; }
  async createChallenge(): Promise<any> { return {}; }
  async updateChallengeStatus(): Promise<void> {}
  async joinChallenge(): Promise<void> {}
  async getChallengeLeaderboard(): Promise<Array<any>> { return []; }
  async getActivityFeed(): Promise<Array<any>> { return []; }
}

export const storage = isDatabaseConfigured() ? new PostgresStorage() : new MemStorage();
