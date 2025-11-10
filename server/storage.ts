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
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db, isDatabaseConfigured } from "./lib/db";
import { eq, isNull } from "drizzle-orm";
import { generateReferralCode } from "./lib/referral-code-generator";

export interface IStorage {
  // Artist methods
  getArtist(id: string): Promise<Artist | undefined>;
  getArtistByEmail(email: string): Promise<Artist | undefined>;
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
  
  // Payout methods
  createPayout(payout: any): Promise<any>;
  updatePayout(id: string, updates: any): Promise<any>;
  getPayoutsByArtist(artistId: string): Promise<any[]>;
  getPendingPayouts(): Promise<any[]>;
  getAllPayouts(): Promise<any[]>;
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

  async getAllArtists(): Promise<Artist[]> {
    const allArtists = await db
      .select()
      .from(artists)
      .where(isNull(artists.deletedAt))
      .orderBy(artists.createdAt);
    return allArtists;
  }

  async createArtist(insertArtist: InsertArtist): Promise<Artist> {
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
      referredBy: null,
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
      shopifyProductId: null,
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
}

export const storage = isDatabaseConfigured() ? new PostgresStorage() : new MemStorage();
