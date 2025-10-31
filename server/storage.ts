import {
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
}

// Supabase storage implementation
class SupabaseStorage implements IStorage {
  async getArtist(id: string): Promise<Artist | undefined> {
    const { data, error } = await supabase
      .from("artists")
      .select("*")
      .eq("id", id)
      .single();
    if (error) return undefined;
    return data as Artist;
  }

  async getArtistByEmail(email: string): Promise<Artist | undefined> {
    const { data, error } = await supabase
      .from("artists")
      .select("*")
      .eq("email", email)
      .single();
    if (error) return undefined;
    return data as Artist;
  }

  async getAllArtists(): Promise<Artist[]> {
    const { data, error } = await supabase
      .from("artists")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return [];
    return data as Artist[];
  }

  async createArtist(insertArtist: InsertArtist): Promise<Artist> {
    const { data, error } = await supabase
      .from("artists")
      .insert([insertArtist])
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Artist;
  }

  async updateArtist(id: string, updates: Partial<Artist>): Promise<Artist> {
    const { data, error } = await supabase
      .from("artists")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Artist;
  }

  async getAdmin(id: string): Promise<Admin | undefined> {
    const { data, error } = await supabase
      .from("admins")
      .select("*")
      .eq("id", id)
      .single();
    if (error) return undefined;
    return data as Admin;
  }

  async getAdminByEmail(email: string): Promise<Admin | undefined> {
    const { data, error } = await supabase
      .from("admins")
      .select("*")
      .eq("email", email)
      .single();
    if (error) return undefined;
    return data as Admin;
  }

  async createAdmin(insertAdmin: InsertAdmin): Promise<Admin> {
    const { data, error } = await supabase
      .from("admins")
      .insert([insertAdmin])
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Admin;
  }

  async getArtwork(id: string): Promise<Artwork | undefined> {
    const { data, error } = await supabase
      .from("artworks")
      .select("*")
      .eq("id", id)
      .single();
    if (error) return undefined;
    return data as Artwork;
  }

  async getArtworksByArtist(artistId: string): Promise<Artwork[]> {
    const { data, error } = await supabase
      .from("artworks")
      .select("*")
      .eq("artist_id", artistId)
      .order("created_at", { ascending: false });
    if (error) return [];
    return data as Artwork[];
  }

  async getAllArtworks(): Promise<ArtworkWithArtist[]> {
    const { data, error } = await supabase
      .from("artworks")
      .select(`
        *,
        artist:artists(id, name, email)
      `)
      .order("created_at", { ascending: false });
    if (error) return [];
    return data as any;
  }

  async createArtwork(insertArtwork: InsertArtwork): Promise<Artwork> {
    const { data, error } = await supabase
      .from("artworks")
      .insert([{ ...insertArtwork, artist_id: insertArtwork.artistId }])
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Artwork;
  }

  async updateArtwork(id: string, updates: Partial<Artwork>): Promise<Artwork> {
    const { data, error } = await supabase
      .from("artworks")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Artwork;
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
    const artist: Artist = {
      ...insertArtist,
      id,
      approved: false,
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
      status: "pending",
      rejectionReason: null,
      shopifyProductId: null,
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
}

export const storage = isSupabaseConfigured() ? new SupabaseStorage() : new MemStorage();
