import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Artists table - users who can upload artwork
export const artists = pgTable("artists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  artistShort: text("artist_short").notNull(), // Initials for SKU generation (e.g., "JH")
  approved: boolean("approved").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Admins table - users who can approve/reject
export const admins = pgTable("admins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Artworks table - submitted artwork
export const artworks = pgTable("artworks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  artistId: varchar("artist_id").notNull().references(() => artists.id),
  title: text("title").notNull(),
  description: text("description"),
  tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
  imageUrl: text("image_url").notNull(),
  status: text("status").notNull().default("pending"), // pending, approved, rejected
  rejectionReason: text("rejection_reason"),
  shopifyProductId: text("shopify_product_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Insert schemas
export const insertArtistSchema = createInsertSchema(artists).omit({
  id: true,
  createdAt: true,
}).extend({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  artistShort: z.string().min(1).max(10).regex(/^[A-Z0-9]+$/, "Must be uppercase letters/numbers only"),
});

export const insertAdminSchema = createInsertSchema(admins).omit({
  id: true,
  createdAt: true,
}).extend({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
});

export const insertArtworkSchema = createInsertSchema(artworks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  shopifyProductId: true,
  rejectionReason: true,
}).extend({
  title: z.string().min(1),
  description: z.string().optional(),
  tags: z.array(z.string()).default([]),
  imageUrl: z.string().min(1), // Accept both URLs and paths
});

export const updateArtworkSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

// Types
export type InsertArtist = z.infer<typeof insertArtistSchema>;
export type Artist = typeof artists.$inferSelect;

export type InsertAdmin = z.infer<typeof insertAdminSchema>;
export type Admin = typeof admins.$inferSelect;

export type InsertArtwork = z.infer<typeof insertArtworkSchema>;
export type UpdateArtwork = z.infer<typeof updateArtworkSchema>;
export type Artwork = typeof artworks.$inferSelect;

// Login schemas
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginCredentials = z.infer<typeof loginSchema>;

// Artwork with artist info
export type ArtworkWithArtist = Artwork & {
  artist: Pick<Artist, 'id' | 'name' | 'email'>;
};
