import {
  artists,
  artworks as artworksTable,
  admins as adminsTable,
  orders as ordersTable,
  sales as salesTable,
  payouts as payoutsTable,
  passwordResetTokens,
  kits as kitsTable,
  type Artist,
  type InsertArtist,
  type Admin,
  type InsertAdmin,
  type Artwork,
  type InsertArtwork,
  type UpdateArtwork,
  type ArtworkWithArtist,
  type PasswordResetToken,
  type Kit,
  type InsertKit,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db, isDatabaseConfigured } from "./lib/db";
import { eq } from "drizzle-orm";
import { generateReferralCode } from "./lib/referral-code-generator";

export interface IStorage {
  // Artist methods
  getArtist(id: string): Promise<Artist | undefined>;
  getArtistByEmail(email: string): Promise<Artist | undefined>;
  getAllArtists(): Promise<Artist[]>;
  createArtist(artist: InsertArtist): Promise<Artist>;
  updateArtist(id: string, updates: Partial<Artist>): Promise<Artist>;

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
  
  // Kit methods
  getAllKits(): Promise<Kit[]>;
  getKit(id: string): Promise<Kit | undefined>;
  createKit(kit: InsertKit): Promise<Kit>;
  unlockKit(shopifyVariantId: string): Promise<Kit | undefined>;
  unlockKitById(kitId: string): Promise<Kit | undefined>;
  getUnlockedKitsCount(): Promise<number>;
}

// PostgreSQL storage implementation using Drizzle ORM
class PostgresStorage implements IStorage {
  async getArtist(id: string): Promise<Artist | undefined> {
    const [artist] = await db
      .select()
      .from(artists)
      .where(eq(artists.id, id))
      .limit(1);
    return artist;
  }

  async getArtistByEmail(email: string): Promise<Artist | undefined> {
    const [artist] = await db
      .select()
      .from(artists)
      .where(eq(artists.email, email))
      .limit(1);
    return artist;
  }

  async getAllArtists(): Promise<Artist[]> {
    const allArtists = await db
      .select()
      .from(artists)
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

  async getAllKits(): Promise<Kit[]> {
    const allKits = await db
      .select()
      .from(kitsTable)
      .orderBy(kitsTable.createdAt);
    return allKits;
  }

  async getKit(id: string): Promise<Kit | undefined> {
    const [kit] = await db
      .select()
      .from(kitsTable)
      .where(eq(kitsTable.id, id))
      .limit(1);
    return kit;
  }

  async createKit(insertKit: InsertKit): Promise<Kit> {
    const [kit] = await db
      .insert(kitsTable)
      .values(insertKit)
      .returning();
    return kit;
  }

  async unlockKit(shopifyVariantId: string): Promise<Kit | undefined> {
    const [kit] = await db
      .update(kitsTable)
      .set({ unlockedAt: new Date() })
      .where(eq(kitsTable.shopifyVariantId, shopifyVariantId))
      .returning();
    return kit;
  }

  async unlockKitById(kitId: string): Promise<Kit | undefined> {
    const [kit] = await db
      .update(kitsTable)
      .set({ unlockedAt: new Date() })
      .where(eq(kitsTable.id, kitId))
      .returning();
    return kit;
  }

  async getUnlockedKitsCount(): Promise<number> {
    const { count, isNotNull } = await import("drizzle-orm");
    const [result] = await db
      .select({ count: count() })
      .from(kitsTable)
      .where(isNotNull(kitsTable.unlockedAt));
    return Number(result.count) || 0;
  }
}

// In-memory storage implementation (fallback)
class MemStorage implements IStorage {
  private artists: Map<string, Artist> = new Map();
  private admins: Map<string, Admin> = new Map();
  private artworks: Map<string, Artwork> = new Map();
  private kits: Map<string, Kit> = new Map();

  async getArtist(id: string): Promise<Artist | undefined> {
    return this.artists.get(id);
  }

  async getArtistByEmail(email: string): Promise<Artist | undefined> {
    return Array.from(this.artists.values()).find((a) => a.email === email);
  }

  async getAllArtists(): Promise<Artist[]> {
    return Array.from(this.artists.values()).sort(
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

  async getAllKits(): Promise<Kit[]> {
    return Array.from(this.kits.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async getKit(id: string): Promise<Kit | undefined> {
    return this.kits.get(id);
  }

  async createKit(insertKit: InsertKit): Promise<Kit> {
    const id = randomUUID();
    const kit: Kit = {
      ...insertKit,
      id,
      price: String(insertKit.price),
      shopifyVariantId: null,
      unlockedAt: null,
      createdAt: new Date(),
    };
    this.kits.set(id, kit);
    return kit;
  }

  async unlockKit(shopifyVariantId: string): Promise<Kit | undefined> {
    const kit = Array.from(this.kits.values()).find(
      (k) => k.shopifyVariantId === shopifyVariantId
    );
    if (kit) {
      const updatedKit = { ...kit, unlockedAt: new Date() };
      this.kits.set(kit.id, updatedKit);
      return updatedKit;
    }
    return undefined;
  }

  async unlockKitById(kitId: string): Promise<Kit | undefined> {
    const kit = this.kits.get(kitId);
    if (kit) {
      const updatedKit = { ...kit, unlockedAt: new Date() };
      this.kits.set(kit.id, updatedKit);
      return updatedKit;
    }
    return undefined;
  }

  async getUnlockedKitsCount(): Promise<number> {
    return Array.from(this.kits.values()).filter((k) => k.unlockedAt !== null).length;
  }
}

export const storage = isDatabaseConfigured() ? new PostgresStorage() : new MemStorage();
