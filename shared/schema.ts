import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, decimal, jsonb, uniqueIndex, index, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Trial status enum - enforces valid status values at database level
export const trialStatusEnum = pgEnum('trial_status', ['active', 'canceled', 'converted', 'expired']);

// Upscale quota type enum - tracks which quota bucket was used
export const upscaleQuotaTypeEnum = pgEnum('upscale_quota_type', ['registration_bonus', 'monthly', 'elite_unlimited']);

// Upscale job status enum - tracks job lifecycle
export const upscaleStatusEnum = pgEnum('upscale_status', ['queued', 'processing', 'completed', 'failed']);

// Artists table - users who can upload artwork
export const artists = pgTable("artists", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  artistShort: text("artist_short").notNull(), // Initials for SKU generation (e.g., "JH")
  approved: boolean("approved").notNull().default(false),
  monthlySales: decimal("monthly_sales", { precision: 10, scale: 2 }).notNull().default('0'), // Current month sales for tier calculation
  subscriptionTier: text("subscription_tier").notNull().default('free'), // free, pro, elite
  stripeCustomerId: text("stripe_customer_id"), // Stripe Customer ID for subscription billing
  stripeSubscriptionId: text("stripe_subscription_id"), // Active Stripe subscription ID
  subscriptionStatus: text("subscription_status"), // active, canceled, past_due, trialing, incomplete
  subscriptionPeriodEnd: timestamp("subscription_period_end"), // When current billing period ends
  trialEndsAt: timestamp("trial_ends_at"), // When free trial ends (computed from Stripe, null if not trialing)
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
  bio: text("bio"), // Artist bio for product pages and profile
  profilePhoto: text("profile_photo"), // URL to artist profile photo
  socialLinks: jsonb("social_links"), // { instagram, twitter, website, etc. }
  adminNotes: text("admin_notes"), // Private admin notes for CRM (relationship tracking, calls, preferences)
  tosAcceptedAt: timestamp("tos_accepted_at"), // Terms of Service acceptance timestamp for legal compliance
  tosIpAddress: text("tos_ip_address"), // IP address when TOS was accepted for audit trail
  tosVersion: text("tos_version"), // Version/hash of TOS accepted (e.g., "v1.0-2025-11" or hash)
  isFeaturedEligible: boolean("is_featured_eligible").notNull().default(false), // Can be featured on homepage (auto-true for Elite, perf-based for Pro, manual for Free)
  featuredPriority: integer("featured_priority").notNull().default(0), // Higher = more likely to be featured (Elite=100, Pro=50, Free=0, +manual boost)
  featuredPinnedUntil: timestamp("featured_pinned_until"), // If set, artist is guaranteed featured until this date (for campaigns/promotions)
  lastFeaturedAt: timestamp("last_featured_at"), // Last time artist appeared in featured rotation (for fair rotation)
  registrationUpscalesUsed: integer("registration_upscales_used").notNull().default(0), // One-time registration bonus (3 max)
  monthlyUpscalesUsed: integer("monthly_upscales_used").notNull().default(0), // Monthly quota usage (resets on billing cycle)
  lastUpscaleResetAt: timestamp("last_upscale_reset_at"), // Last time monthly quota was reset
  lifetimeUpscalesProcessed: integer("lifetime_upscales_processed").notNull().default(0), // Total upscales ever processed (analytics)
  totalUpscaleCostCents: integer("total_upscale_cost_cents").notNull().default(0), // Cumulative cost tracking in cents
  deletedAt: timestamp("deleted_at"), // Soft delete timestamp
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  // Performance indexes for high-volume subscription operations
  // Unique indexes for Stripe IDs (one customer/subscription per artist, allows NULL)
  stripeCustomerIdx: uniqueIndex("artists_stripe_customer_id_idx").on(table.stripeCustomerId),
  stripeSubscriptionIdx: uniqueIndex("artists_stripe_subscription_id_idx").on(table.stripeSubscriptionId),
  // Regular indexes for filtering (many artists share same tier/status)
  subscriptionTierIdx: index("artists_subscription_tier_idx").on(table.subscriptionTier),
  subscriptionStatusIdx: index("artists_subscription_status_idx").on(table.subscriptionStatus),
}));

// Subscription Trials - Analytics for trial conversion tracking
export const subscriptionTrials = pgTable("subscription_trials", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  artistId: varchar("artist_id").notNull().references(() => artists.id),
  stripeCustomerId: text("stripe_customer_id"), // For cross-table joins with Stripe data
  stripeSubscriptionId: text("stripe_subscription_id"), // Associated Stripe subscription
  tier: text("tier").notNull(), // pro, elite
  status: trialStatusEnum("status").notNull().default("active"), // active, canceled, converted, expired
  trialSource: text("trial_source"), // How trial was activated (homepage_cta, dashboard_upgrade, admin_grant)
  trialStartedAt: timestamp("trial_started_at").notNull(),
  scheduledTrialEnd: timestamp("scheduled_trial_end").notNull(), // When trial was supposed to end (14 or 7 days)
  convertedAt: timestamp("converted_at"), // When they converted to paid subscription
  canceledAt: timestamp("canceled_at"), // When they explicitly canceled trial
  expiredAt: timestamp("expired_at"), // When trial expired without conversion
  downgradedAt: timestamp("downgraded_at"), // Post-trial churn (converted then downgraded)
  cancellationReason: text("cancellation_reason"), // Why they didn't convert (user-provided or inferred)
  emailsSent: integer("emails_sent").notNull().default(0), // How many trial emails we sent
  emailTemplatesSent: text("email_templates_sent").array().default(sql`ARRAY[]::text[]`), // Which templates sent (for A/B testing)
  lastEmailSentAt: timestamp("last_email_sent_at"), // Last reminder email sent
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  artistIdx: index("subscription_trials_artist_id_idx").on(table.artistId),
  statusIdx: index("subscription_trials_status_idx").on(table.status),
  tierConvertedIdx: index("subscription_trials_tier_converted_idx").on(table.tier, table.status), // Composite for analytics
  trialStartedIdx: index("subscription_trials_started_at_idx").on(table.trialStartedAt), // Time-series queries
}));

// Upscale Jobs - Priority queue for async upscaling (MUST be defined before upscale_usage due to FK reference)
export const upscaleJobs = pgTable("upscale_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  artistId: varchar("artist_id").notNull().references(() => artists.id),
  fileHash: text("file_hash").notNull(),
  originalUrl: text("original_url").notNull(),
  upscaledUrl: text("upscaled_url"),
  status: upscaleStatusEnum("status").notNull().default("queued"),
  priority: integer("priority").notNull().default(3), // 1=Elite, 2=Pro, 3=Free
  replicateId: text("replicate_id").unique(), // Unique Replicate prediction ID for webhook lookups
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").notNull().default(0), // Track retry attempts (max 3)
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  artistIdx: index("upscale_jobs_artist_id_idx").on(table.artistId),
  statusPriorityCreatedIdx: index("upscale_jobs_status_priority_created_idx").on(table.status, table.priority, table.createdAt), // Queue processing with FIFO
  replicateIdx: uniqueIndex("upscale_jobs_replicate_id_idx").on(table.replicateId), // Webhook lookups
}));

// Upscale Usage - Tracks all upscale operations for analytics and deduplication
export const upscaleUsage = pgTable("upscale_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  artistId: varchar("artist_id").notNull().references(() => artists.id),
  fileHash: text("file_hash").notNull(), // SHA-256 hash for deduplication
  quotaType: upscaleQuotaTypeEnum("quota_type").notNull(), // registration_bonus, monthly, elite_unlimited
  tier: text("tier").notNull(), // Snapshot of artist tier when upscale occurred
  ipAddress: text("ip_address"), // For abuse detection
  jobId: varchar("job_id").references(() => upscaleJobs.id), // Link to job that processed this (nullable for cached results)
  replicateId: text("replicate_id"), // Replicate prediction ID (nullable for cached results)
  status: upscaleStatusEnum("status").notNull().default("queued"),
  originalUrl: text("original_url"), // Original image URL
  upscaledUrl: text("upscaled_url"), // Upscaled result URL
  originalWidth: integer("original_width"), // Numeric width for efficient queries
  originalHeight: integer("original_height"), // Numeric height for efficient queries
  upscaledWidth: integer("upscaled_width"), // Numeric width for result
  upscaledHeight: integer("upscaled_height"), // Numeric height for result
  originalDpi: integer("original_dpi"), // Calculated DPI of original
  costCents: integer("cost_cents").notNull().default(0), // Cost in cents
  errorMessage: text("error_message"), // If failed
  createdAt: timestamp("created_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => ({
  artistIdx: index("upscale_usage_artist_id_idx").on(table.artistId),
  fileHashIdx: index("upscale_usage_file_hash_idx").on(table.fileHash), // For deduplication lookups
  statusIdx: index("upscale_usage_status_idx").on(table.status),
  createdAtIdx: index("upscale_usage_created_at_idx").on(table.createdAt), // For time-series analytics
  ipCreatedIdx: index("upscale_usage_ip_created_idx").on(table.ipAddress, table.createdAt), // Abuse detection (daily checks)
  jobIdx: index("upscale_usage_job_id_idx").on(table.jobId), // Job reconciliation
  replicateIdx: index("upscale_usage_replicate_id_idx").on(table.replicateId), // Webhook reconciliation
}));

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
  artworkStory: text("artwork_story"), // Artist's story/inspiration behind the piece
  styleTags: text("style_tags").array().default(sql`ARRAY[]::text[]`), // Style descriptors (modern, abstract, nature, etc.)
  suggestedUse: text("suggested_use"), // How customers might use this (living room, office, gift, etc.)
  seoSlug: text("seo_slug"), // URL-friendly version of title for product pages
  shopifyProductId: text("shopify_product_id"),
  shopifyProductStatus: text("shopify_product_status").default("draft"), // draft, active - tracks Shopify product visibility
  shopifyTemplate: text("shopify_template"), // Shopify template suffix (e.g., "art", "apparel", "accessories")
  productType: text("product_type").notNull().default("art_print"), // Product category: art_print, apparel, accessories, etc.
  printifyProductId: text("printify_product_id"), // Printify product ID
  printifyImageId: text("printify_image_id"), // Uploaded image ID in Printify
  lastSaleDate: timestamp("last_sale_date"), // Most recent sale date (tracked from order items) - used to identify inactive artworks
  archivedAt: timestamp("archived_at"), // When artwork was auto-archived for inactivity (null = active)
  archiveWarningEmailSentAt: timestamp("archive_warning_email_sent_at"), // When we sent the 30-day warning email
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

export const insertSubscriptionTrialSchema = createInsertSchema(subscriptionTrials).omit({
  id: true,
  createdAt: true,
}).extend({
  artistId: z.string().min(1),
  tier: z.enum(['pro', 'elite']),
  status: z.enum(['active', 'canceled', 'converted', 'expired']).default('active'),
  trialStartedAt: z.date(),
  scheduledTrialEnd: z.date(),
  stripeSubscriptionId: z.string().optional(),
  trialSource: z.string().optional(),
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
  artworkStory: z.string().optional(),
  styleTags: z.array(z.string()).optional().default([]),
  suggestedUse: z.string().optional(),
  seoSlug: z.string().optional(), // Optional - server generates from title if not provided
});

export const updateArtworkSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

// Types
export type InsertArtist = z.infer<typeof insertArtistSchema>;
export type Artist = typeof artists.$inferSelect;

export type InsertSubscriptionTrial = z.infer<typeof insertSubscriptionTrialSchema>;
export type SubscriptionTrial = typeof subscriptionTrials.$inferSelect;

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

// Featured tier enum for type safety
export type FeaturedTier = "admin_override" | "premium" | "merit";

// Featured Subscriptions - Track premium featured placement subscriptions
export const featuredSubscriptions = pgTable("featured_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  artistId: varchar("artist_id").notNull().references(() => artists.id),
  testimonialId: varchar("testimonial_id").notNull().references(() => testimonials.id),
  featuredTier: text("featured_tier").notNull().$type<FeaturedTier>(), // "admin_override", "premium", "merit"
  tierPriority: integer("tier_priority").notNull().default(50), // Lower = higher priority. admin_override=10, premium=20, merit=30-100
  stripeSubscriptionId: text("stripe_subscription_id"), // Null for merit/admin, populated for premium
  subscriptionStatus: text("subscription_status"), // active, cancelled, past_due, unpaid (for premium tier)
  currentPeriodEnd: timestamp("current_period_end"), // When current subscription period ends (from Stripe)
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"), // Null = ongoing, set when subscription ends
  expiresAt: timestamp("expires_at"), // When this featured placement expires (for merit rotation)
  endReason: text("end_reason"), // Why subscription ended: "cancelled", "expired", "testimonial_deleted", "rotation", "admin_action"
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Featured Rotation Log - Audit trail for monthly rotation changes
export const featuredRotationLog = pgTable("featured_rotation_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  rotationDate: timestamp("rotation_date").notNull(), // When this rotation was executed
  testimonialId: varchar("testimonial_id").notNull().references(() => testimonials.id),
  artistId: varchar("artist_id").notNull().references(() => artists.id),
  featuredTier: text("featured_tier").notNull(), // "merit", "premium", "admin_override"
  artistEarnings: decimal("artist_earnings", { precision: 10, scale: 2 }).notNull(), // Earnings at time of rotation
  rank: integer("rank"), // Rank within merit tier (1-5 for top 5)
  action: text("action").notNull(), // "added", "removed", "kept"
  reason: text("reason"), // Why this change happened
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Insert schemas
export const insertFeaturedSubscriptionSchema = createInsertSchema(featuredSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  featuredTier: z.enum(['admin_override','premium','merit'])
});

// Types for featured subscriptions
export type FeaturedSubscription = typeof featuredSubscriptions.$inferSelect;
export type InsertFeaturedSubscription = z.infer<typeof insertFeaturedSubscriptionSchema>;

export type FeaturedRotationLog = typeof featuredRotationLog.$inferSelect;

// Email Logs - Track all outbound email communications
export const emailLogs = pgTable("email_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recipientEmail: text("recipient_email").notNull(),
  recipientType: text("recipient_type").notNull(), // "artist" or "admin"
  recipientId: varchar("recipient_id"), // Artist or Admin ID
  emailType: text("email_type").notNull(), // "welcome", "password_reset", "portfolio_decision", "artwork_decision", etc.
  subject: text("subject").notNull(),
  resendId: text("resend_id"), // Resend's email ID for tracking
  status: text("status").notNull().default("pending"), // pending, sent, delivered, failed, bounced
  errorMessage: text("error_message"),
  metadata: jsonb("metadata"), // Additional context (artwork title, decision reason, etc.)
  sentAt: timestamp("sent_at"),
  deliveredAt: timestamp("delivered_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Artwork Approval Log - Track all admin decisions with timestamps and notes
export const artworkApprovalLog = pgTable("artwork_approval_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  artworkId: varchar("artwork_id").notNull().references(() => artworks.id),
  adminId: varchar("admin_id").notNull().references(() => admins.id),
  previousStatus: text("previous_status").notNull(), // pending, approved, rejected
  newStatus: text("new_status").notNull(), // pending, approved, rejected
  rejectionReason: text("rejection_reason"),
  adminNotes: text("admin_notes"), // Private notes for admin team
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Types for new tables
export type EmailLog = typeof emailLogs.$inferSelect;
export type InsertEmailLog = typeof emailLogs.$inferInsert;

export type ArtworkApprovalLog = typeof artworkApprovalLog.$inferSelect;
export type InsertArtworkApprovalLog = typeof artworkApprovalLog.$inferInsert;

// Testimonial with artist referral info for affiliate links
export type TestimonialWithArtist = Testimonial & {
  artistReferralCode?: string | null; // Referral code from linked artist account
};

// Artwork with artist info
export type ArtworkWithArtist = Artwork & {
  artist: Pick<Artist, 'id' | 'name' | 'email'>;
};

// ===================================
// INFLUENCER AFFILIATE PROGRAM SCHEMA
// ===================================

// Influencers table - Non-artist promoters who earn commissions
export const influencers = pgTable("influencers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  affiliateCode: text("affiliate_code").unique(), // Unique code for tracking (generated on approval)
  status: text("status").notNull().default("pending"), // pending, active, suspended
  
  // Commission settings
  commissionType: text("commission_type").notNull().default("percentage"), // "percentage" or "flat_fee"
  commissionRate: decimal("commission_rate", { precision: 10, scale: 2 }).notNull().default('10.00'), // 10.00 = 10% or $10 flat
  
  // Tier system
  currentTier: text("current_tier").notNull().default("bronze"), // bronze, silver, gold, platinum, elite
  // Note: Sales counts and earnings are calculated via queries, not stored to prevent drift
  
  // Application info
  socialLinks: jsonb("social_links"), // { instagram, tiktok, youtube, twitter, etc. }
  audienceSize: integer("audience_size"), // Self-reported follower count
  applicationNotes: text("application_notes"), // Why they want to join
  adminNotes: text("admin_notes"), // Private admin notes
  
  // Stripe payout info (reuse Connect infrastructure)
  stripeAccountId: text("stripe_account_id"),
  stripeAccountStatus: text("stripe_account_status"),
  stripeOnboardingComplete: boolean("stripe_onboarding_complete").notNull().default(false),
  
  // Referral system (influencers recruit other influencers)
  referredBy: varchar("referred_by").references((): any => influencers.id),
  // Note: Referral bonuses calculated via queries from affiliate_conversions, not stored
  
  // Timestamps
  approvedAt: timestamp("approved_at"),
  lastActiveAt: timestamp("last_active_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Affiliate Conversions - Track sales/commissions AND artist signups
export const affiliateConversions = pgTable("affiliate_conversions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  influencerId: varchar("influencer_id").notNull().references(() => influencers.id),
  clickId: varchar("click_id").references(() => affiliateClicks.id),
  artistId: varchar("artist_id").references(() => artists.id), // For artist signup conversions
  conversionType: text("conversion_type").notNull().default("sale"), // sale or artist_signup
  
  // Order details (nullable for artist signup conversions)
  shopifyOrderId: text("shopify_order_id"), // From Shopify webhook
  orderTotal: decimal("order_total", { precision: 10, scale: 2 }),
  customerEmail: text("customer_email"), // For deduplication
  
  // Commission calculation (nullable for artist signup conversions)
  commissionType: text("commission_type"), // percentage or flat_fee
  commissionRate: decimal("commission_rate", { precision: 10, scale: 2 }), // Rate at time of sale
  commissionEarned: decimal("commission_earned", { precision: 10, scale: 2 }),
  tierBonus: decimal("tier_bonus", { precision: 10, scale: 2 }).default('0'), // Extra from tier
  challengeBonus: decimal("challenge_bonus", { precision: 10, scale: 2 }).default('0'), // Challenge winnings
  totalPayout: decimal("total_payout", { precision: 10, scale: 2 }), // Sum of all bonuses
  
  // Payout tracking
  payoutStatus: text("payout_status").notNull().default("pending"), // pending, paid, failed
  paidAt: timestamp("paid_at"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Affiliate Clicks - Track every click on affiliate links (MOVED AFTER affiliateConversions to fix forward reference)
export const affiliateClicks = pgTable("affiliate_clicks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  influencerId: varchar("influencer_id").notNull().references(() => influencers.id),
  affiliateCode: text("affiliate_code").notNull().unique(), // Indexed for fast lookups
  
  // Request metadata
  ipAddress: text("ip_address"), // Store for fraud detection; ensure GDPR/CCPA compliance with retention policy
  userAgent: text("user_agent"),
  referrer: text("referrer"), // Where they came from (Instagram, TikTok, etc.)
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  
  // Conversion tracking (no FK to conversions to avoid circular dependency; join via conversions.clickId instead)
  convertedToSale: boolean("converted_to_sale").notNull().default(false),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Achievements - Badge system for gamification
export const achievements = pgTable("achievements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(), // "quick_start", "century_club", "hot_streak", etc.
  name: text("name").notNull(), // "Quick Start"
  description: text("description").notNull(), // "First sale within 24 hours"
  icon: text("icon").notNull(), // Emoji or icon name (⚡, 💯, 🔥, etc.)
  category: text("category").notNull(), // "milestone", "performance", "streak", "earnings"
  
  // Unlock criteria (stored as JSON for flexibility)
  criteria: jsonb("criteria").notNull(), // { type: "first_sale_hours", value: 24 }
  
  // Rarity/prestige
  rarity: text("rarity").notNull().default("common"), // common, rare, epic, legendary
  points: integer("points").notNull().default(10), // Leaderboard points
  
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Influencer Achievements - Track unlocked badges
export const influencerAchievements = pgTable("influencer_achievements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  influencerId: varchar("influencer_id").notNull().references(() => influencers.id),
  achievementId: varchar("achievement_id").notNull().references(() => achievements.id),
  
  // Social sharing
  shared: boolean("shared").notNull().default(false), // Did they share on social media?
  sharedAt: timestamp("shared_at"),
  
  unlockedAt: timestamp("unlocked_at").notNull().defaultNow(),
});

// Challenges - Monthly/weekly competitions
export const challenges = pgTable("challenges", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // "Flash 48", "First to 100", "Social Blitz"
  description: text("description").notNull(),
  
  // Challenge type and criteria
  challengeType: text("challenge_type").notNull(), // "most_sales", "fastest_to_x", "highest_conversion", "team_battle"
  metric: text("metric").notNull(), // "conversions", "earnings", "clicks", "conversion_rate"
  goal: decimal("goal", { precision: 10, scale: 2 }), // Target value (optional)
  
  // Time window
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  
  // Prizes
  firstPlacePrize: decimal("first_place_prize", { precision: 10, scale: 2 }).notNull(), // Cash bonus
  secondPlacePrize: decimal("second_place_prize", { precision: 10, scale: 2 }),
  thirdPlacePrize: decimal("third_place_prize", { precision: 10, scale: 2 }),
  prizeDescription: text("prize_description"), // "Featured homepage spot", "Exclusive merch", etc.
  
  // Status
  status: text("status").notNull().default("upcoming"), // upcoming, active, completed, cancelled
  winnerId: varchar("winner_id").references(() => influencers.id),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Challenge Participants - Track who joined each challenge
export const challengeParticipants = pgTable("challenge_participants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  challengeId: varchar("challenge_id").notNull().references(() => challenges.id),
  influencerId: varchar("influencer_id").notNull().references(() => influencers.id),
  
  // Performance in this challenge
  currentScore: decimal("current_score", { precision: 10, scale: 2 }).notNull().default('0'),
  rank: integer("rank"), // Current ranking
  prizeWon: decimal("prize_won", { precision: 10, scale: 2 }), // If they won
  
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

// Activity Feed Events - Real-time competition feed
export const activityFeedEvents = pgTable("activity_feed_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  influencerId: varchar("influencer_id").notNull().references(() => influencers.id),
  
  eventType: text("event_type").notNull(), // "tier_upgrade", "achievement_unlocked", "big_sale", "challenge_win", "new_rank"
  eventData: jsonb("event_data").notNull(), // { tier: "gold", achievement: "Century Club", earnings: 127, etc. }
  
  // Display
  message: text("message").notNull(), // "🔥 @sarahinfluencer just hit Gold tier!"
  isPublic: boolean("is_public").notNull().default(true), // Show in public feed?
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Insert schemas for influencer program
export const insertInfluencerSchema = createInsertSchema(influencers).omit({
  id: true,
  createdAt: true,
});

// Application schema - for public influencer applications (no affiliateCode yet)
export const influencerApplicationSchema = insertInfluencerSchema.omit({
  affiliateCode: true,
  status: true,
  currentTier: true,
  commissionType: true,
  commissionRate: true,
  stripeAccountId: true,
  stripeAccountStatus: true,
  stripeOnboardingComplete: true,
  adminNotes: true,
  approvedAt: true,
});

export const insertAffiliateClickSchema = createInsertSchema(affiliateClicks).omit({
  id: true,
  createdAt: true,
});

export const insertAffiliateConversionSchema = createInsertSchema(affiliateConversions).omit({
  id: true,
  createdAt: true,
});

export const insertAchievementSchema = createInsertSchema(achievements).omit({
  id: true,
  createdAt: true,
});

export const insertChallengeSchema = createInsertSchema(challenges).omit({
  id: true,
  createdAt: true,
});

// Types for influencer program
export type Influencer = typeof influencers.$inferSelect;
export type InsertInfluencer = z.infer<typeof insertInfluencerSchema>;

export type AffiliateClick = typeof affiliateClicks.$inferSelect;
export type InsertAffiliateClick = z.infer<typeof insertAffiliateClickSchema>;

export type AffiliateConversion = typeof affiliateConversions.$inferSelect;
export type InsertAffiliateConversion = z.infer<typeof insertAffiliateConversionSchema>;

export type Achievement = typeof achievements.$inferSelect;
export type InsertAchievement = z.infer<typeof insertAchievementSchema>;

export type InfluencerAchievement = typeof influencerAchievements.$inferSelect;
export type InsertInfluencerAchievement = typeof influencerAchievements.$inferInsert;

export type Challenge = typeof challenges.$inferSelect;
export type InsertChallenge = z.infer<typeof insertChallengeSchema>;

export type ChallengeParticipant = typeof challengeParticipants.$inferSelect;
export type InsertChallengeParticipant = typeof challengeParticipants.$inferInsert;

export type ActivityFeedEvent = typeof activityFeedEvents.$inferSelect;
export type InsertActivityFeedEvent = typeof activityFeedEvents.$inferInsert;

// ===================================
// AI PORTRAIT GENERATION SCHEMA
// ===================================

// AI Generations - Track all AI image generations with usage metadata
export const aiGenerations = pgTable("ai_generations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // User tracking (artistId for artists, customerId for future customer feature)
  artistId: varchar("artist_id").references(() => artists.id),
  customerEmail: text("customer_email"), // For non-artist customers (future feature)
  
  // Generation details
  prompt: text("prompt").notNull(),
  imageUrl: text("image_url"), // Saved file path after generation
  imageBase64: text("image_base64"), // Temporary storage during processing
  size: text("size").notNull().default("1024x1024"), // 256x256, 512x512, 1024x1024
  model: text("model").notNull().default("gpt-image-1"), // Track which model was used
  
  // Cost and status tracking
  costUsd: decimal("cost_usd", { precision: 10, scale: 4 }).notNull().default('0.04'), // Estimated cost per generation
  status: text("status").notNull().default("pending"), // pending, completed, failed
  errorMessage: text("error_message"), // If generation failed
  
  // Usage type
  generationType: text("generation_type").notNull(), // "artist_studio", "customer_portrait"
  
  // Workflow tracking
  convertedToArtwork: boolean("converted_to_artwork").notNull().default(false), // Did artist submit as artwork?
  artworkId: varchar("artwork_id").references(() => artworks.id), // If converted to artwork
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// AI Credits - Track free and paid credit balances per user
export const aiCredits = pgTable("ai_credits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // User identification
  artistId: varchar("artist_id").unique().references(() => artists.id), // For artists
  customerEmail: text("customer_email").unique(), // For customers (future feature)
  userType: text("user_type").notNull(), // "artist" or "customer"
  
  // Credit balances
  freeCreditsRemaining: integer("free_credits_remaining").notNull().default(0),
  paidCreditsRemaining: integer("paid_credits_remaining").notNull().default(0),
  
  // Free credits tracking
  totalFreeCreditsGranted: integer("total_free_credits_granted").notNull().default(0), // 10 for artists, 3 for customers
  
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// AI Credit Purchases - Track purchases of additional credits
export const aiCreditPurchases = pgTable("ai_credit_purchases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // User tracking
  artistId: varchar("artist_id").references(() => artists.id),
  customerEmail: text("customer_email"),
  userType: text("user_type").notNull(), // "artist" or "customer"
  
  // Purchase details
  creditsQuantity: integer("credits_quantity").notNull(), // Number of credits purchased
  amountPaid: decimal("amount_paid", { precision: 10, scale: 2 }).notNull(), // Amount paid in USD
  pricePerCredit: decimal("price_per_credit", { precision: 10, scale: 2 }).notNull().default('0.50'), // $0.50 per credit
  
  // Payment tracking
  stripePaymentIntentId: text("stripe_payment_intent_id").unique(),
  status: text("status").notNull().default("pending"), // pending, completed, refunded, failed
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Insert schemas for AI tables
export const insertAiGenerationSchema = createInsertSchema(aiGenerations).omit({
  id: true,
  createdAt: true,
  imageUrl: true, // Set after file save
  imageBase64: true, // Temporary field
  status: true, // Set by server
  errorMessage: true,
  convertedToArtwork: true,
  artworkId: true,
}).extend({
  prompt: z.string().min(10, "Prompt must be at least 10 characters").max(1000, "Prompt must be less than 1000 characters"),
  size: z.enum(["256x256", "512x512", "1024x1024"]).default("1024x1024"),
  generationType: z.enum(["artist_studio", "customer_portrait"]),
});

export const insertAiCreditSchema = createInsertSchema(aiCredits).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  userType: z.enum(["artist", "customer"]),
});

export const insertAiCreditPurchaseSchema = createInsertSchema(aiCreditPurchases).omit({
  id: true,
  createdAt: true,
  status: true, // Set by server
}).extend({
  userType: z.enum(["artist", "customer"]),
  creditsQuantity: z.number().int().min(1, "Must purchase at least 1 credit"),
});

// Types for AI tables
export type AiGeneration = typeof aiGenerations.$inferSelect;
export type InsertAiGeneration = z.infer<typeof insertAiGenerationSchema>;

export type AiCredit = typeof aiCredits.$inferSelect;
export type InsertAiCredit = z.infer<typeof insertAiCreditSchema>;

export type AiCreditPurchase = typeof aiCreditPurchases.$inferSelect;
export type InsertAiCreditPurchase = z.infer<typeof insertAiCreditPurchaseSchema>;

// ============================================
// 247 CreatorStack - Digital Products Platform
// ============================================

// CreatorStack Kits - Digital product bundles (templates + AI prompts)
export const creatorstackKits = pgTable("creatorstack_kits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Kit details
  name: text("name").notNull(), // "Social Media Blitz", "Email Launch Rocket"
  slug: text("slug").notNull().unique(), // URL-friendly: "social-media-blitz"
  description: text("description").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(), // $47.00
  
  // Product details
  shopifyProductId: text("shopify_product_id").unique(), // Link to Shopify product
  category: text("category").notNull(), // "social_media", "email_marketing", "content_creation"
  features: jsonb("features"), // Array of feature bullets
  
  // Deliverables
  canvaTemplateCount: integer("canva_template_count").notNull().default(0), // e.g., 50 templates
  canvaTemplateUrl: text("canva_template_url"), // Link to Canva template folder/file
  promptLibraryUrl: text("prompt_library_url"), // Link to AI prompt library (PDF/Notion/etc)
  bonusResources: jsonb("bonus_resources"), // Additional resources (videos, guides, etc.)
  
  // Status
  status: text("status").notNull().default("draft"), // draft, active, archived
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// CreatorStack Buyers - Customer accounts
export const creatorstackBuyers = pgTable("creatorstack_buyers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Account details
  email: text("email").notNull().unique(),
  password: text("password").notNull(), // Hashed password
  name: text("name").notNull(),
  
  // Subscription status (for future Pro membership)
  isPro: boolean("is_pro").notNull().default(false),
  proSubscriptionId: text("pro_subscription_id"), // Shopify subscription ID
  proExpiresAt: timestamp("pro_expires_at"), // When Pro membership expires
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// CreatorStack Purchases - Track kit purchases and access
export const creatorstackPurchases = pgTable("creatorstack_purchases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // Buyer and kit
  buyerId: varchar("buyer_id").notNull().references(() => creatorstackBuyers.id),
  kitId: varchar("kit_id").notNull().references(() => creatorstackKits.id),
  
  // Purchase details
  shopifyOrderId: text("shopify_order_id").notNull(), // Shopify order ID for webhook tracking
  shopifyLineItemId: text("shopify_line_item_id").notNull(), // Line item ID for idempotency
  shopifyOrderNumber: text("shopify_order_number"), // Human-readable order # (e.g., "#1001")
  amountPaid: decimal("amount_paid", { precision: 10, scale: 2 }).notNull(), // Actual amount paid
  
  // Access control
  accessGranted: boolean("access_granted").notNull().default(false), // Has buyer been granted access?
  accessGrantedAt: timestamp("access_granted_at"), // When access was unlocked
  
  // Download tracking
  downloadCount: integer("download_count").notNull().default(0), // How many times resources were downloaded
  lastAccessedAt: timestamp("last_accessed_at"), // Last time buyer accessed this kit
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  // Unique constraint for idempotent webhook processing
  shopifyLineItemUnique: uniqueIndex("creatorstack_purchase_shopify_line").on(table.shopifyOrderId, table.shopifyLineItemId),
}));

// CreatorStack Prompt Generations - Track AI prompt usage
export const creatorstackPromptGenerations = pgTable("creatorstack_prompt_generations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  // User tracking
  buyerId: varchar("buyer_id").notNull().references(() => creatorstackBuyers.id),
  kitId: varchar("kit_id").references(() => creatorstackKits.id), // Which kit they used (optional)
  
  // Generation details
  promptType: text("prompt_type").notNull(), // "social_caption", "email_subject", "blog_intro"
  userInput: text("user_input").notNull(), // What the user entered (topic, keywords, etc.)
  aiResponse: text("ai_response").notNull(), // Generated content from GPT
  model: text("model").notNull().default("gpt-4o-mini"), // Which model was used
  
  // Cost tracking
  tokensUsed: integer("tokens_used").notNull().default(0),
  costUsd: decimal("cost_usd", { precision: 10, scale: 4 }).notNull().default('0'),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Insert schemas for CreatorStack
export const insertCreatorstackKitSchema = createInsertSchema(creatorstackKits).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1, "Kit name is required"),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/, "Price must be a valid number"),
  category: z.enum(["social_media", "email_marketing", "content_creation", "other"]),
  status: z.enum(["draft", "active", "archived"]).default("draft"),
});

export const insertCreatorstackBuyerSchema = createInsertSchema(creatorstackBuyers).omit({
  id: true,
  createdAt: true,
}).extend({
  email: z.string().email(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().min(1, "Name is required"),
});

export const insertCreatorstackPurchaseSchema = createInsertSchema(creatorstackPurchases).omit({
  id: true,
  createdAt: true,
  accessGrantedAt: true,
  lastAccessedAt: true,
}).extend({
  buyerId: z.string().uuid(),
  kitId: z.string().uuid(),
  shopifyOrderId: z.string().min(1, "Shopify order ID is required"),
  shopifyLineItemId: z.string().min(1, "Shopify line item ID is required"),
  amountPaid: z.string().regex(/^\d+(\.\d{1,2})?$/, "Amount must be a valid number"),
});

export const insertCreatorstackPromptGenerationSchema = createInsertSchema(creatorstackPromptGenerations).omit({
  id: true,
  createdAt: true,
}).extend({
  buyerId: z.string().uuid(),
  promptType: z.string().min(1, "Prompt type is required"),
  userInput: z.string().min(1, "User input is required"),
  aiResponse: z.string().min(1, "AI response is required"),
});

// Types for CreatorStack
export type CreatorstackKit = typeof creatorstackKits.$inferSelect;
export type InsertCreatorstackKit = z.infer<typeof insertCreatorstackKitSchema>;

export type CreatorstackBuyer = typeof creatorstackBuyers.$inferSelect;
export type InsertCreatorstackBuyer = z.infer<typeof insertCreatorstackBuyerSchema>;

export type CreatorstackPurchase = typeof creatorstackPurchases.$inferSelect;
export type InsertCreatorstackPurchase = z.infer<typeof insertCreatorstackPurchaseSchema>;

export type CreatorstackPromptGeneration = typeof creatorstackPromptGenerations.$inferSelect;
export type InsertCreatorstackPromptGeneration = z.infer<typeof insertCreatorstackPromptGenerationSchema>;
