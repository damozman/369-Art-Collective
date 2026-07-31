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
  influencers,
  affiliateClicks,
  affiliateConversions,
  upscaleJobs,
  upscaleUsage,
  waitlist,
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
  type Influencer,
  type InsertInfluencer,
  type AffiliateClick,
  type InsertAffiliateClick,
  type AffiliateConversion,
  type InsertAffiliateConversion,
  type Waitlist,
  type InsertWaitlist,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db, isDatabaseConfigured } from "./lib/db";
import { eq, isNull, isNotNull, and, desc, asc, gte, sql as drizzleSql, sum } from "drizzle-orm";
import { generateReferralCode } from "./lib/referral-code-generator";

export interface IStorage {
  // Helper methods for transactions
  getArtistsTable(): any;
  getPortfolioSubmissionsTable(): any;

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
  createArtworkWithLimitCheck(artwork: InsertArtwork, uploadLimit: number): Promise<Artwork>;
  updateArtwork(id: string, updates: Partial<Artwork>): Promise<Artwork>;
  
  // Artwork archive methods
  getArchivedArtworks(): Promise<ArtworkWithArtist[]>;
  getArtworksEligibleForArchive(monthsInactive: number): Promise<ArtworkWithArtist[]>;
  getArtworksEligibleForArchiveWarning(monthsInactive: number, warningDaysBefore: number): Promise<ArtworkWithArtist[]>;
  archiveArtwork(id: string): Promise<Artwork>;
  reactivateArtwork(id: string): Promise<Artwork>;
  updateArtworkLastSaleDate(artworkId: string, saleDate: Date): Promise<void>;

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
  // AI UPSCALING METHODS
  // ===================================
  
  // Upscale Job CRUD
  createUpscaleJob(job: { artistId: string; fileHash: string; originalUrl: string; status: string; priority: number; replicateId: string }): Promise<any>;
  getUpscaleJobById(id: string): Promise<any | undefined>;
  updateUpscaleJob(id: string, updates: Partial<any>): Promise<any>;
  updateUpscaleUsageByJobId(jobId: string, updates: Partial<any>): Promise<void>;
  getArtistById(id: string): Promise<Artist | undefined>;
  getAllUpscaleUsage(): Promise<any[]>;
  
  // Waitlist methods
  createWaitlistEntry(entry: InsertWaitlist): Promise<Waitlist>;
  getAllWaitlistEntries(): Promise<Waitlist[]>;
}

// PostgreSQL storage implementation using Drizzle ORM
class PostgresStorage implements IStorage {
  // Helper methods to expose table references for transactions
  getArtistsTable() {
    return artists;
  }

  getPortfolioSubmissionsTable() {
    return portfolioSubmissions;
  }

  async getArtist(id: string): Promise<Artist | undefined> {
    console.log("[Storage.getArtist] Called with ID:", id, "Type:", typeof id);
    const [artist] = await db
      .select()
      .from(artists)
      .where(eq(artists.id, id))
      .limit(1);
    
    console.log("[Storage.getArtist] Query result:", artist ? `Found artist: ${artist.email} (deleted: ${artist.deletedAt ? 'yes' : 'no'})` : 'NOT FOUND');
    
    // Filter out deleted artists
    if (artist?.deletedAt) {
      console.log("[Storage.getArtist] Artist is soft-deleted, returning undefined");
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
    // Use a single JOIN query instead of N+1 queries
    // This prevents "Too many connections" errors with Neon serverless
    const results = await db
      .select({
        // Artwork fields
        id: artworksTable.id,
        artistId: artworksTable.artistId,
        title: artworksTable.title,
        description: artworksTable.description,
        imageUrl: artworksTable.imageUrl,
        tags: artworksTable.tags,
        status: artworksTable.status,
        rejectionReason: artworksTable.rejectionReason,
        ipDeclarationAccepted: artworksTable.ipDeclarationAccepted,
        ipDeclarationText: artworksTable.ipDeclarationText,
        shopifyProductId: artworksTable.shopifyProductId,
        shopifyProductStatus: artworksTable.shopifyProductStatus,
        shopifyTemplate: artworksTable.shopifyTemplate,
        printifyProductId: artworksTable.printifyProductId,
        printifyImageId: artworksTable.printifyImageId,
        lastSaleDate: artworksTable.lastSaleDate,
        archivedAt: artworksTable.archivedAt,
        archiveWarningEmailSentAt: artworksTable.archiveWarningEmailSentAt,
        createdAt: artworksTable.createdAt,
        updatedAt: artworksTable.updatedAt,
        artworkStory: artworksTable.artworkStory,
        styleTags: artworksTable.styleTags,
        suggestedUse: artworksTable.suggestedUse,
        seoSlug: artworksTable.seoSlug,
        productType: artworksTable.productType,
        // Artist fields (nested)
        artist: {
          id: artists.id,
          name: artists.name,
          email: artists.email,
        },
      })
      .from(artworksTable)
      .leftJoin(artists, eq(artworksTable.artistId, artists.id))
      .orderBy(artworksTable.createdAt);
    
    return results as ArtworkWithArtist[];
  }

  async createArtwork(insertArtwork: InsertArtwork): Promise<Artwork> {
    const [artwork] = await db
      .insert(artworksTable)
      .values(insertArtwork)
      .returning();
    return artwork;
  }

  async createArtworkWithLimitCheck(
    insertArtwork: InsertArtwork,
    uploadLimit: number
  ): Promise<Artwork> {
    // Note: Small race condition possible without transactions, but acceptable for MVP
    // Admin review process will catch any edge cases
    const count = await db
      .select({ count: drizzleSql<number>`count(*)::int` })
      .from(artworksTable)
      .where(eq(artworksTable.artistId, insertArtwork.artistId));

    const artworkCount = count[0]?.count || 0;

    if (artworkCount >= uploadLimit) {
      throw new Error(
        `Upload limit reached. Each artist may have up to ${uploadLimit} artworks.`
      );
    }

    // Within limit, create artwork
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

  // Artwork archive methods
  async getArchivedArtworks(): Promise<ArtworkWithArtist[]> {
    const artworks = await db
      .select()
      .from(artworksTable)
      .where(isNotNull(artworksTable.archivedAt))
      .orderBy(desc(artworksTable.archivedAt));
    
    const artworksWithArtist = await Promise.all(
      artworks.map(async (artwork) => {
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

  async getArtworksEligibleForArchive(monthsInactive: number): Promise<ArtworkWithArtist[]> {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsInactive);
    
    const artworks = await db
      .select()
      .from(artworksTable)
      .where(
        and(
          eq(artworksTable.status, "approved"),
          isNull(artworksTable.archivedAt),
          drizzleSql`(
            ${artworksTable.lastSaleDate} IS NULL 
            AND ${artworksTable.createdAt} < ${cutoffDate}
          ) OR (
            ${artworksTable.lastSaleDate} < ${cutoffDate}
          )`
        )
      );
    
    const artworksWithArtist = await Promise.all(
      artworks.map(async (artwork) => {
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

  async getArtworksEligibleForArchiveWarning(monthsInactive: number, warningDaysBefore: number): Promise<ArtworkWithArtist[]> {
    const archiveCutoffDate = new Date();
    archiveCutoffDate.setMonth(archiveCutoffDate.getMonth() - monthsInactive);
    
    const warningCutoffDate = new Date(archiveCutoffDate);
    warningCutoffDate.setDate(warningCutoffDate.getDate() + warningDaysBefore);
    
    const artworks = await db
      .select()
      .from(artworksTable)
      .where(
        and(
          eq(artworksTable.status, "approved"),
          isNull(artworksTable.archivedAt),
          isNull(artworksTable.archiveWarningEmailSentAt),
          drizzleSql`(
            ${artworksTable.lastSaleDate} IS NULL 
            AND ${artworksTable.createdAt} < ${warningCutoffDate}
          ) OR (
            ${artworksTable.lastSaleDate} < ${warningCutoffDate}
          )`
        )
      );
    
    const artworksWithArtist = await Promise.all(
      artworks.map(async (artwork) => {
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

  async archiveArtwork(id: string): Promise<Artwork> {
    const [archivedArtwork] = await db
      .update(artworksTable)
      .set({ 
        archivedAt: new Date(),
        shopifyProductStatus: "draft",
        updatedAt: new Date()
      })
      .where(eq(artworksTable.id, id))
      .returning();
    if (!archivedArtwork) throw new Error("Artwork not found");
    return archivedArtwork;
  }

  async reactivateArtwork(id: string): Promise<Artwork> {
    const [reactivatedArtwork] = await db
      .update(artworksTable)
      .set({ 
        archivedAt: null,
        archiveWarningEmailSentAt: null,
        shopifyProductStatus: "active",
        updatedAt: new Date()
      })
      .where(eq(artworksTable.id, id))
      .returning();
    if (!reactivatedArtwork) throw new Error("Artwork not found");
    return reactivatedArtwork;
  }

  async updateArtworkLastSaleDate(artworkId: string, saleDate: Date): Promise<void> {
    await db
      .update(artworksTable)
      .set({ lastSaleDate: saleDate, updatedAt: new Date() })
      .where(eq(artworksTable.id, artworkId));
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
        a.referral_code as "artistReferralCode"
      FROM testimonials t
      LEFT JOIN artists a ON t.artist_id = a.id
      WHERE t.is_active = true
        AND t.featured = true
      ORDER BY
        t.display_order ASC,
        t.created_at ASC
    `;
    
    const results = await db.execute(query);
    
    // Results now have properly camelCased column names from the SQL aliases
    return results.rows as any[];
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
    // Get the influencer to check if they already have an affiliate code
    const influencer = await this.getInfluencer(id);
    if (!influencer) {
      throw new Error("Influencer not found");
    }

    // Generate affiliate code if not already present
    let affiliateCode = influencer.affiliateCode;
    if (!affiliateCode) {
      // Generate unique affiliate code with INF- prefix
      let attempts = 0;
      const maxAttempts = 10;
      
      while (attempts < maxAttempts) {
        affiliateCode = `INF-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
        
        // Check if code already exists
        const existing = await db.query.influencers.findFirst({
          where: eq(influencers.affiliateCode, affiliateCode),
        });
        
        if (!existing) break;
        attempts++;
      }
      
      if (attempts === maxAttempts) {
        throw new Error("Failed to generate unique affiliate code");
      }
    }

    const [approved] = await db
      .update(influencers)
      .set({ 
        status: "active",
        affiliateCode,
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


  // ===================================
  // AI UPSCALING METHODS
  // ===================================

  async getArtistById(id: string): Promise<Artist | undefined> {
    return this.getArtist(id);
  }

  async createUpscaleJob(job: { 
    artistId: string; 
    fileHash: string; 
    originalUrl: string; 
    status: string; 
    priority: number; 
    replicateId: string 
  }): Promise<any> {
    const [created] = await db
      .insert(upscaleJobs)
      .values(job as any)
      .returning();
    return created;
  }

  async getUpscaleJobById(id: string): Promise<any | undefined> {
    return await db.query.upscaleJobs.findFirst({
      where: eq(upscaleJobs.id, id)
    });
  }

  async updateUpscaleJob(id: string, updates: Partial<any>): Promise<any> {
    const [updated] = await db
      .update(upscaleJobs)
      .set(updates)
      .where(eq(upscaleJobs.id, id))
      .returning();
    return updated;
  }

  async updateUpscaleUsageByJobId(jobId: string, updates: Partial<any>): Promise<void> {
    await db
      .update(upscaleUsage)
      .set(updates)
      .where(eq(upscaleUsage.jobId, jobId));
  }

  async getAllUpscaleUsage(): Promise<any[]> {
    return await db
      .select()
      .from(upscaleUsage)
      .orderBy(desc(upscaleUsage.createdAt));
  }
  
  // Waitlist methods
  async createWaitlistEntry(entry: InsertWaitlist): Promise<Waitlist> {
    const [created] = await db
      .insert(waitlist)
      .values(entry)
      .returning();
    return created;
  }
  
  async getAllWaitlistEntries(): Promise<Waitlist[]> {
    return await db
      .select()
      .from(waitlist)
      .orderBy(desc(waitlist.createdAt));
  }
}

// In-memory storage implementation (fallback)
class MemStorage implements IStorage {
  private artists: Map<string, Artist> = new Map();
  private admins: Map<string, Admin> = new Map();
  private portfolioSubmissions: Map<string, PortfolioSubmission> = new Map();
  private violationReports: Map<string, ViolationReport> = new Map();
  private artworks: Map<string, Artwork> = new Map();
  private waitlist: Map<string, Waitlist> = new Map();

  // Helper methods for transactions (not used in MemStorage but required by interface)
  getArtistsTable() {
    throw new Error("Transactions not supported in MemStorage");
  }

  getPortfolioSubmissionsTable() {
    throw new Error("Transactions not supported in MemStorage");
  }

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
    const artist = {
      ...insertArtist,
      id,
      referralCode,
      approved: false,
      monthlySales: '0',
      stripeAccountId: null,
      stripeAccountStatus: null,
      stripeOnboardingComplete: insertArtist.stripeOnboardingComplete ?? false,
      stripeDetailsSubmitted: insertArtist.stripeDetailsSubmitted ?? false,
      stripeChargesEnabled: insertArtist.stripeChargesEnabled ?? false,
      stripePayoutsEnabled: insertArtist.stripePayoutsEnabled ?? false,
      stripeRequirements: null,
      stripeAccountLinkExpiresAt: null,
      stripeDefaultCurrency: null,
      externalAccountLast4: null,
      referredBy: null,
      referralSource: insertArtist.referralSource ?? null,
      tosAcceptedAt: null,
      tosIpAddress: null,
      tosVersion: null,
      registrationUpscalesUsed: insertArtist.registrationUpscalesUsed ?? 0,
      monthlyUpscalesUsed: insertArtist.monthlyUpscalesUsed ?? 0,
      lastUpscaleResetAt: null,
      lifetimeUpscalesProcessed: insertArtist.lifetimeUpscalesProcessed ?? 0,
      totalUpscaleCostCents: insertArtist.totalUpscaleCostCents ?? 0,
      deletedAt: null,
      createdAt: new Date(),
    } as unknown as Artist;
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
    const artwork = {
      ...insertArtwork,
      id,
      description: insertArtwork.description ?? null,
      artworkStory: insertArtwork.artworkStory ?? null,
      status: "pending",
      rejectionReason: null,
      ipDeclarationText: null,
      shopifyProductId: null,
      shopifyProductStatus: "draft",
      printifyProductId: null,
      printifyImageId: null,
      lastSaleDate: null,
      archivedAt: null,
      archiveWarningEmailSentAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as Artwork;
    this.artworks.set(id, artwork);
    return artwork;
  }

  async createArtworkWithLimitCheck(
    insertArtwork: InsertArtwork,
    uploadLimit: number
  ): Promise<Artwork> {
    const artworks = await this.getArtworksByArtist(insertArtwork.artistId);
    if (artworks.length >= uploadLimit) {
      throw new Error(
        `Upload limit reached. Each artist may have up to ${uploadLimit} artworks.`
      );
    }

    // Within limit, create artwork
    return this.createArtwork(insertArtwork);
  }

  async updateArtwork(id: string, updates: Partial<Artwork>): Promise<Artwork> {
    const artwork = this.artworks.get(id);
    if (!artwork) throw new Error("Artwork not found");
    const updated = { ...artwork, ...updates, updatedAt: new Date() };
    this.artworks.set(id, updated);
    return updated;
  }

  // Artwork archive methods
  async getArchivedArtworks(): Promise<ArtworkWithArtist[]> {
    const artworks = Array.from(this.artworks.values())
      .filter((a) => a.archivedAt !== null && a.archivedAt !== undefined)
      .sort((a, b) => (b.archivedAt?.getTime() || 0) - (a.archivedAt?.getTime() || 0));
    
    return Promise.all(
      artworks.map(async (artwork) => {
        const artist = this.artists.get(artwork.artistId);
        return {
          ...artwork,
          artist: artist ? {
            id: artist.id,
            name: artist.name,
            email: artist.email,
          } : undefined,
        };
      })
    ) as Promise<ArtworkWithArtist[]>;
  }

  async getArtworksEligibleForArchive(monthsInactive: number): Promise<ArtworkWithArtist[]> {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsInactive);
    
    const artworks = Array.from(this.artworks.values()).filter((a) => {
      if (a.status !== "approved" || a.archivedAt) return false;
      
      const referenceDate = a.lastSaleDate || a.createdAt;
      return referenceDate < cutoffDate;
    });
    
    return Promise.all(
      artworks.map(async (artwork) => {
        const artist = this.artists.get(artwork.artistId);
        return {
          ...artwork,
          artist: artist ? {
            id: artist.id,
            name: artist.name,
            email: artist.email,
          } : undefined,
        };
      })
    ) as Promise<ArtworkWithArtist[]>;
  }

  async getArtworksEligibleForArchiveWarning(monthsInactive: number, warningDaysBefore: number): Promise<ArtworkWithArtist[]> {
    const archiveCutoffDate = new Date();
    archiveCutoffDate.setMonth(archiveCutoffDate.getMonth() - monthsInactive);
    
    const warningCutoffDate = new Date(archiveCutoffDate);
    warningCutoffDate.setDate(warningCutoffDate.getDate() + warningDaysBefore);
    
    const artworks = Array.from(this.artworks.values()).filter((a) => {
      if (a.status !== "approved" || a.archivedAt || a.archiveWarningEmailSentAt) return false;
      
      const referenceDate = a.lastSaleDate || a.createdAt;
      return referenceDate < warningCutoffDate;
    });
    
    return Promise.all(
      artworks.map(async (artwork) => {
        const artist = this.artists.get(artwork.artistId);
        return {
          ...artwork,
          artist: artist ? {
            id: artist.id,
            name: artist.name,
            email: artist.email,
          } : undefined,
        };
      })
    ) as Promise<ArtworkWithArtist[]>;
  }

  async archiveArtwork(id: string): Promise<Artwork> {
    const artwork = this.artworks.get(id);
    if (!artwork) throw new Error("Artwork not found");
    const updated = {
      ...artwork,
      archivedAt: new Date(),
      shopifyProductStatus: "draft" as const,
      updatedAt: new Date()
    };
    this.artworks.set(id, updated);
    return updated;
  }

  async reactivateArtwork(id: string): Promise<Artwork> {
    const artwork = this.artworks.get(id);
    if (!artwork) throw new Error("Artwork not found");
    const updated = {
      ...artwork,
      archivedAt: null,
      archiveWarningEmailSentAt: null,
      shopifyProductStatus: "active" as const,
      updatedAt: new Date()
    };
    this.artworks.set(id, updated);
    return updated;
  }

  async updateArtworkLastSaleDate(artworkId: string, saleDate: Date): Promise<void> {
    const artwork = this.artworks.get(artworkId);
    if (artwork) {
      this.artworks.set(artworkId, {
        ...artwork,
        lastSaleDate: saleDate,
        updatedAt: new Date()
      });
    }
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

  

  // ===================================
  // AI UPSCALING METHODS (Stubs)
  // ===================================

  async getArtistById(id: string): Promise<Artist | undefined> {
    return this.getArtist(id);
  }

  async createUpscaleJob(_job: { artistId: string; fileHash: string; originalUrl: string; status: string; priority: number; replicateId: string }): Promise<any> {
    console.log("MemStorage: createUpscaleJob (stub)");
    return { id: randomUUID() };
  }

  async getUpscaleJobById(_id: string): Promise<any | undefined> {
    console.log("MemStorage: getUpscaleJobById (stub)");
    return undefined;
  }

  async updateUpscaleJob(_id: string, _updates: Partial<any>): Promise<any> {
    console.log("MemStorage: updateUpscaleJob (stub)");
    return {};
  }

  async updateUpscaleUsageByJobId(_jobId: string, _updates: Partial<any>): Promise<void> {
    console.log("MemStorage: updateUpscaleUsageByJobId (stub)");
  }

  async getAllUpscaleUsage(): Promise<any[]> {
    console.log("MemStorage: getAllUpscaleUsage (stub)");
    return [];
  }
  
  // Waitlist methods
  async createWaitlistEntry(entry: InsertWaitlist): Promise<Waitlist> {
    const created: Waitlist = {
      id: randomUUID(),
      email: entry.email,
      name: entry.name,
      interest: entry.interest,
      createdAt: new Date(),
    };
    this.waitlist.set(created.id, created);
    console.log("MemStorage: Created waitlist entry:", created.email);
    return created;
  }
  
  async getAllWaitlistEntries(): Promise<Waitlist[]> {
    return Array.from(this.waitlist.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }
}

export const storage: IStorage = isDatabaseConfigured() ? new PostgresStorage() : new MemStorage();
