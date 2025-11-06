import {
  artists,
  artworks as artworksTable,
  admins as adminsTable,
  orders as ordersTable,
  sales as salesTable,
  payouts as payoutsTable,
  type Artist,
  type InsertArtist,
  type Admin,
  type InsertAdmin,
  type Artwork,
  type InsertArtwork,
  type UpdateArtwork,
  type ArtworkWithArtist,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { supabase, isSupabaseConfigured } from "./lib/supabase";
import { db, isDatabaseConfigured } from "./lib/db";
import { eq } from "drizzle-orm";
import { generateReferralCode } from "./lib/referral-code-generator";

// Helper functions to convert between camelCase (TypeScript) and snake_case (Supabase)
function toSnakeCase(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj; // Preserve Date objects
  if (Array.isArray(obj)) return obj.map(toSnakeCase);
  if (typeof obj !== 'object') return obj;
  
  const result: any = {};
  for (const key in obj) {
    const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    result[snakeKey] = toSnakeCase(obj[key]); // Recursively convert nested objects
  }
  return result;
}

function toCamelCase(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj; // Preserve Date objects
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  if (typeof obj !== 'object') return obj;
  
  const result: any = {};
  for (const key in obj) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = toCamelCase(obj[key]); // Recursively convert nested objects
  }
  return result;
}

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

// Supabase storage implementation
class SupabaseStorage implements IStorage {
  async getArtist(id: string): Promise<Artist | undefined> {
    // Use Drizzle ORM to bypass Supabase schema cache issues
    const [artist] = await db
      .select()
      .from(artists)
      .where(eq(artists.id, id))
      .limit(1);
    return artist;
  }

  async getArtistByEmail(email: string): Promise<Artist | undefined> {
    // Use Drizzle ORM to bypass Supabase schema cache issues
    const [artist] = await db
      .select()
      .from(artists)
      .where(eq(artists.email, email))
      .limit(1);
    return artist;
  }

  async getAllArtists(): Promise<Artist[]> {
    // Use Drizzle ORM to bypass Supabase schema cache issues
    const allArtists = await db
      .select()
      .from(artists)
      .orderBy(artists.createdAt);
    return allArtists;
  }

  async createArtist(insertArtist: InsertArtist): Promise<Artist> {
    // Generate unique referral code
    const referralCode = generateReferralCode(insertArtist.name);
    
    // Use Drizzle ORM to bypass Supabase schema cache issues
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
    // Use Drizzle ORM to bypass Supabase schema cache issues
    const [updatedArtist] = await db
      .update(artists)
      .set(updates)
      .where(eq(artists.id, id))
      .returning();
    if (!updatedArtist) throw new Error("Artist not found");
    return updatedArtist;
  }

  async getAdmin(id: string): Promise<Admin | undefined> {
    const { data, error } = await supabase
      .from("admins")
      .select("*")
      .eq("id", id)
      .single();
    if (error) return undefined;
    return toCamelCase(data) as Admin;
  }

  async getAdminByEmail(email: string): Promise<Admin | undefined> {
    const { data, error } = await supabase
      .from("admins")
      .select("*")
      .eq("email", email)
      .single();
    if (error) return undefined;
    return toCamelCase(data) as Admin;
  }

  async createAdmin(insertAdmin: InsertAdmin): Promise<Admin> {
    const { data, error } = await supabase
      .from("admins")
      .insert([toSnakeCase(insertAdmin)])
      .select()
      .single();
    if (error) throw new Error(error.message);
    return toCamelCase(data) as Admin;
  }

  async getArtwork(id: string): Promise<Artwork | undefined> {
    // Use Drizzle ORM to bypass Supabase schema cache issues
    const [artwork] = await db
      .select()
      .from(artworksTable)
      .where(eq(artworksTable.id, id))
      .limit(1);
    return artwork;
  }

  async getArtworksByArtist(artistId: string): Promise<Artwork[]> {
    // Use Drizzle ORM to bypass Supabase schema cache issues
    const artworks = await db
      .select()
      .from(artworksTable)
      .where(eq(artworksTable.artistId, artistId))
      .orderBy(artworksTable.createdAt);
    return artworks;
  }

  async getAllArtworks(): Promise<ArtworkWithArtist[]> {
    // Use Drizzle ORM to bypass Supabase schema cache issues
    // Note: Drizzle doesn't support nested joins directly, so we fetch and combine manually
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
    // Use Drizzle ORM to bypass Supabase schema cache issues
    const [artwork] = await db
      .insert(artworksTable)
      .values(insertArtwork)
      .returning();
    return artwork;
  }

  async updateArtwork(id: string, updates: Partial<Artwork>): Promise<Artwork> {
    // Use Drizzle ORM to bypass Supabase schema cache issues
    const [updatedArtwork] = await db
      .update(artworksTable)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(artworksTable.id, id))
      .returning();
    if (!updatedArtwork) throw new Error("Artwork not found");
    return updatedArtwork;
  }

  // MVP Order/Sale methods - use Drizzle ORM
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
  private artworks: Map<string, Artwork> = new Map();

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

export const storage = isSupabaseConfigured() ? new SupabaseStorage() : new MemStorage();
