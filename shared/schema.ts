import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, decimal, jsonb } from "drizzle-orm/pg-core";
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
  monthlySales: decimal("monthly_sales", { precision: 10, scale: 2 }).notNull().default('0'), // Current month sales for tier calculation
  stripeAccountId: text("stripe_account_id"), // Stripe Connect account ID for payouts
  stripeAccountStatus: text("stripe_account_status"), // pending, active, restricted, complete
  stripeOnboardingComplete: boolean("stripe_onboarding_complete").notNull().default(false), // Has completed Stripe onboarding
  stripeDetailsSubmitted: boolean("stripe_details_submitted").notNull().default(false), // Has submitted required details
  stripeChargesEnabled: boolean("stripe_charges_enabled").notNull().default(false), // Can accept charges
  stripePayoutsEnabled: boolean("stripe_payouts_enabled").notNull().default(false), // Can receive payouts
  stripeRequirements: jsonb("stripe_requirements"), // Stores currently_due/past_due requirements from Stripe
  stripeAccountLinkExpiresAt: timestamp("stripe_account_link_expires_at"), // When the onboarding link expires
  stripeDefaultCurrency: text("stripe_default_currency"), // Default payout currency (e.g., "usd")
  externalAccountLast4: text("external_account_last4"), // Last 4 digits of bank account for UI display
  referralCode: text("referral_code").notNull().unique(), // Unique code for referral links (e.g., "ARTIST-ABC123")
  referredBy: varchar("referred_by").references((): any => artists.id), // Which artist recruited them
  referralSource: text("referral_source"), // Source of referral: "testimonial" or "general" (captured from utm_medium)
  tosAcceptedAt: timestamp("tos_accepted_at"), // Terms of Service acceptance timestamp for legal compliance
  tosIpAddress: text("tos_ip_address"), // IP address when TOS was accepted for audit trail
  tosVersion: text("tos_version"), // Version/hash of TOS accepted (e.g., "v1.0-2025-11" or hash)
  deletedAt: timestamp("deleted_at"), // Soft delete timestamp
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

// Password Reset Tokens - Secure password reset flow
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(), // User's email (artist or admin)
  hashedToken: text("hashed_token").notNull().unique(), // SHA-256 hashed token
  userType: text("user_type").notNull(), // "artist" or "admin"
  expiresAt: timestamp("expires_at").notNull(), // 60 minutes from creation
  isUsed: boolean("is_used").notNull().default(false), // Single-use enforcement
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Portfolio Submissions - images submitted during artist registration
export const portfolioSubmissions = pgTable("portfolio_submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  artistId: varchar("artist_id").notNull().references(() => artists.id),
  imageUrl: text("image_url").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Violation Reports - tracking suspected IP violations
export const violationReports = pgTable("violation_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  artworkId: varchar("artwork_id").notNull().references(() => artworks.id),
  reporterId: varchar("reporter_id").notNull().references(() => admins.id), // Admin who flagged it
  reason: text("reason").notNull(), // e.g., "trademark", "copyright", "inappropriate"
  notes: text("notes"), // Additional details about the violation
  status: text("status").notNull().default("pending"), // pending, under_review, resolved, dismissed
  resolvedAt: timestamp("resolved_at"),
  resolutionNotes: text("resolution_notes"),
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
  ipDeclarationAccepted: boolean("ip_declaration_accepted").notNull().default(false), // Artist confirms original work/proper rights
  ipDeclarationText: text("ip_declaration_text"), // Snapshot of declaration text at time of upload
  shopifyProductId: text("shopify_product_id"),
  shopifyProductStatus: text("shopify_product_status").default("draft"), // draft, active - tracks Shopify product visibility
  printifyProductId: text("printify_product_id"), // Printify product ID
  printifyImageId: text("printify_image_id"), // Uploaded image ID in Printify
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Insert schemas
export const insertArtistSchema = createInsertSchema(artists).omit({
  id: true,
  createdAt: true,
  referralCode: true, // Generated automatically
  tosAcceptedAt: true, // Server sets this
  tosIpAddress: true, // Server sets this
  tosVersion: true, // Server sets this
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

export const insertPortfolioSubmissionSchema = createInsertSchema(portfolioSubmissions).omit({
  id: true,
  createdAt: true,
}).extend({
  artistId: z.string().min(1),
  imageUrl: z.string().min(1),
});

export const insertArtworkSchema = createInsertSchema(artworks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  shopifyProductId: true,
  rejectionReason: true,
  ipDeclarationText: true, // Server sets this
}).extend({
  title: z.string().min(1),
  description: z.string().optional(),
  tags: z.array(z.string()).default([]),
  imageUrl: z.string().min(1), // Accept both URLs and paths
  ipDeclarationAccepted: z.boolean().refine((val) => val === true, {
    message: "You must confirm you have rights to this artwork",
  }),
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

export type InsertPortfolioSubmission = z.infer<typeof insertPortfolioSubmissionSchema>;
export type PortfolioSubmission = typeof portfolioSubmissions.$inferSelect;

export type InsertArtwork = z.infer<typeof insertArtworkSchema>;
export type UpdateArtwork = z.infer<typeof updateArtworkSchema>;
export type Artwork = typeof artworks.$inferSelect;

export const insertViolationReportSchema = createInsertSchema(violationReports).omit({
  id: true,
  createdAt: true,
  resolvedAt: true,
}).extend({
  artworkId: z.string().min(1),
  reporterId: z.string().min(1),
  reason: z.enum(["trademark", "copyright", "inappropriate", "other"]),
  notes: z.string().optional(),
});

export type InsertViolationReport = z.infer<typeof insertViolationReportSchema>;
export type ViolationReport = typeof violationReports.$inferSelect;

// Login schemas
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginCredentials = z.infer<typeof loginSchema>;

// Password change schema
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
  confirmPassword: z.string().min(6),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export type ChangePassword = z.infer<typeof changePasswordSchema>;

// Artist profile update schema
export const updateArtistProfileSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  artistShort: z.string().min(1).max(10).regex(/^[A-Z0-9]+$/, "Must be uppercase letters/numbers only").optional(),
});

export type UpdateArtistProfile = z.infer<typeof updateArtistProfileSchema>;

// Forgot password schema
export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export type ForgotPassword = z.infer<typeof forgotPasswordSchema>;

// Reset password schema
export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(6),
  confirmPassword: z.string().min(6),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export type ResetPassword = z.infer<typeof resetPasswordSchema>;

// Admin profile update schema
export const updateAdminProfileSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
});

export type UpdateAdminProfile = z.infer<typeof updateAdminProfileSchema>;

// Delete account schema (for artist self-deletion)
export const deleteAccountSchema = z.object({
  password: z.string().min(1),
});

export type DeleteAccount = z.infer<typeof deleteAccountSchema>;

// Password Reset Token types
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

// Printify Products - Store blueprint/provider mappings
export const printifyProducts = pgTable("printify_products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  blueprintId: integer("blueprint_id").notNull(),
  blueprintTitle: text("blueprint_title").notNull(),
  printProviderId: integer("print_provider_id").notNull(),
  printProviderTitle: text("print_provider_title").notNull(),
  variants: jsonb("variants").notNull(), // Store variant details (id, size, price)
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Orders - Track customer orders
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  shopifyOrderId: text("shopify_order_id").notNull().unique(),
  printifyOrderId: text("printify_order_id"), // Printify order ID after fulfillment
  artworkId: varchar("artwork_id").notNull().references(() => artworks.id),
  artistId: varchar("artist_id").notNull().references(() => artists.id),
  productPrice: decimal("product_price", { precision: 10, scale: 2 }).notNull(),
  printifyCost: decimal("printify_cost", { precision: 10, scale: 2 }).notNull(),
  shippingCost: decimal("shipping_cost", { precision: 10, scale: 2 }).notNull(),
  profit: decimal("profit", { precision: 10, scale: 2 }).notNull(), // Product price - Printify cost - shipping
  utmSource: text("utm_source"), // UTM source parameter (e.g., artist referral code)
  utmMedium: text("utm_medium"), // UTM medium (e.g., social, email)
  utmCampaign: text("utm_campaign"), // UTM campaign (e.g., spring2025)
  referralArtistId: varchar("referral_artist_id").references(() => artists.id), // Artist who referred this sale
  referralBonus: boolean("referral_bonus").notNull().default(false), // +5% bonus applied?
  status: text("status").notNull().default("pending"), // pending, fulfilled, cancelled
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Sales - Individual sales for royalty calculation
export const sales = pgTable("sales", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  artistId: varchar("artist_id").notNull().references(() => artists.id),
  artworkId: varchar("artwork_id").notNull().references(() => artworks.id),
  saleAmount: decimal("sale_amount", { precision: 10, scale: 2 }).notNull(),
  profit: decimal("profit", { precision: 10, scale: 2 }).notNull(),
  royaltyTier: integer("royalty_tier").notNull(), // 30, 35, 40, 45 (percentage)
  baseRoyalty: decimal("base_royalty", { precision: 10, scale: 2 }).notNull(),
  referralBonus: decimal("referral_bonus", { precision: 10, scale: 2 }).notNull().default('0'),
  recruitmentBonus: decimal("recruitment_bonus", { precision: 10, scale: 2 }).notNull().default('0'),
  totalEarnings: decimal("total_earnings", { precision: 10, scale: 2 }).notNull(),
  payoutId: varchar("payout_id").references((): any => payouts.id), // Which payout this was included in
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Referrals - Track UTM-based referrals (artist drove traffic)
export const referrals = pgTable("referrals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  artistId: varchar("artist_id").notNull().references(() => artists.id),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  orderId: varchar("order_id").references(() => orders.id), // If this referral led to a sale
  bonusApplied: boolean("bonus_applied").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Artist Referrals - Track when artists recruit other artists
export const artistReferrals = pgTable("artist_referrals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recruiterId: varchar("recruiter_id").notNull().references(() => artists.id), // Artist who recruited
  recruitedId: varchar("recruited_id").notNull().references(() => artists.id), // Artist who was recruited
  bonusPercentage: integer("bonus_percentage").notNull().default(5), // 5% of recruited artist's royalties
  totalEarned: decimal("total_earned", { precision: 10, scale: 2 }).notNull().default('0'),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Payouts - Track artist payouts
export const payouts = pgTable("payouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  artistId: varchar("artist_id").notNull().references(() => artists.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  stripeTransferId: text("stripe_transfer_id"), // Stripe transfer ID
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  salesCount: integer("sales_count").notNull(), // Number of sales in this payout
  baseRoyalties: decimal("base_royalties", { precision: 10, scale: 2 }).notNull(),
  referralBonuses: decimal("referral_bonuses", { precision: 10, scale: 2 }).notNull().default('0'),
  recruitmentBonuses: decimal("recruitment_bonuses", { precision: 10, scale: 2 }).notNull().default('0'),
  failureReason: text("failure_reason"),
  lastSyncedAt: timestamp("last_synced_at"), // Last time we synced with Stripe
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

// Stripe Webhook Events - Track processed webhooks for idempotency
export const stripeWebhookEvents = pgTable("stripe_webhook_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: text("event_id").notNull().unique(), // Stripe event ID for deduplication
  eventType: text("event_type").notNull(), // e.g., account.updated, payout.paid
  status: text("status").notNull().default("pending"), // pending, processed, failed
  payload: jsonb("payload"), // Full webhook payload for debugging
  errorMessage: text("error_message"), // Error details if processing failed
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Testimonials - Success stories from artists
export const testimonials = pgTable("testimonials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  artistId: varchar("artist_id").references(() => artists.id), // Optional: link to artist account
  artistName: text("artist_name").notNull(), // Display name (can differ from account name)
  title: text("title").notNull(), // Testimonial title
  quote: text("quote").notNull(), // Testimonial text/quote
  videoProvider: text("video_provider").notNull().default("youtube"), // youtube, vimeo, upload, other
  videoUrl: text("video_url"), // External video URL (YouTube, Vimeo, etc.)
  videoThumbnailUrl: text("video_thumbnail_url"), // Thumbnail image URL
  localVideoPath: text("local_video_path"), // Local video file path if uploaded directly
  earningsUsd: decimal("earnings_usd", { precision: 10, scale: 2 }).notNull().default('0'), // Monthly earnings to display
  productsCount: integer("products_count").notNull().default(0), // Number of products
  featured: boolean("featured").notNull().default(false), // Highlight this testimonial
  isActive: boolean("is_active").notNull().default(true), // Show on public pages
  displayOrder: integer("display_order").notNull().default(0), // Order for display (lower = first)
  shareSlug: text("share_slug").notNull().unique(), // URL-friendly slug for sharing (e.g., "jane-doe-artist")
  shareExcerpt: text("share_excerpt"), // Optional short description for social sharing
  shareImageUrl: text("share_image_url"), // Optional custom image for social sharing Open Graph
  allowEmbed: boolean("allow_embed").notNull().default(false), // Allow embedding on external sites
  artistConsent: boolean("artist_consent").notNull().default(false), // Artist has explicitly consented to public testimonial
  consentTimestamp: timestamp("consent_timestamp"), // When consent was granted
  consentVersion: text("consent_version"), // Version/hash of consent agreement text for audit trail
  approvedByAdminId: varchar("approved_by_admin_id"), // Admin who approved the testimonial
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Insert schema for testimonials
export const insertTestimonialSchema = createInsertSchema(testimonials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  consentTimestamp: true, // Set server-side when consent is given
  consentVersion: true, // Set server-side based on current consent language
  approvedByAdminId: true, // Set server-side from session
}).extend({
  artistName: z.string().min(1, "Artist name is required"),
  title: z.string().min(1, "Title is required"),
  quote: z.string().min(10, "Quote must be at least 10 characters"),
  videoProvider: z.enum(["youtube", "vimeo", "upload", "other"]),
  videoUrl: z.string().url().optional().or(z.literal("")),
  shareSlug: z.string().min(1).regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
  earningsUsd: z.string().optional(),
  productsCount: z.number().int().min(0).optional(),
  artistConsent: z.boolean().refine((val) => val === true, {
    message: "Artist must consent to public testimonial sharing for legal protection",
  }),
});

// Types for new tables
export type Payout = typeof payouts.$inferSelect;
export type InsertPayout = typeof payouts.$inferInsert;

export type StripeWebhookEvent = typeof stripeWebhookEvents.$inferSelect;
export type InsertStripeWebhookEvent = typeof stripeWebhookEvents.$inferInsert;

export type Testimonial = typeof testimonials.$inferSelect;
export type InsertTestimonial = z.infer<typeof insertTestimonialSchema>;

// Testimonial with artist referral info for affiliate links
export type TestimonialWithArtist = Testimonial & {
  artistReferralCode?: string | null; // Referral code from linked artist account
};

// Artwork with artist info
export type ArtworkWithArtist = Artwork & {
  artist: Pick<Artist, 'id' | 'name' | 'email'>;
};
