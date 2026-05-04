import { pgTable, index, foreignKey, unique, varchar, text, boolean, numeric, timestamp, jsonb, integer, json, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const trialStatus = pgEnum("trial_status", ['active', 'canceled', 'converted', 'expired'])
export const upscaleQuotaType = pgEnum("upscale_quota_type", ['registration_bonus', 'monthly', 'elite_unlimited'])
export const upscaleStatus = pgEnum("upscale_status", ['queued', 'processing', 'completed', 'failed'])


export const artists = pgTable("artists", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	email: text().notNull(),
	password: text().notNull(),
	name: text().notNull(),
	artistShort: text("artist_short").notNull(),
	approved: boolean().default(false).notNull(),
	monthlySales: numeric("monthly_sales", { precision: 10, scale:  2 }).default('0.00').notNull(),
	subscriptionTier: text("subscription_tier").default('free').notNull(),
	stripeCustomerId: text("stripe_customer_id"),
	stripeSubscriptionId: text("stripe_subscription_id"),
	subscriptionStatus: text("subscription_status"),
	subscriptionPeriodEnd: timestamp("subscription_period_end", { mode: 'string' }),
	trialEndsAt: timestamp("trial_ends_at", { mode: 'string' }),
	stripeAccountId: text("stripe_account_id"),
	stripeAccountStatus: text("stripe_account_status"),
	stripeOnboardingComplete: boolean("stripe_onboarding_complete").default(false).notNull(),
	stripeDetailsSubmitted: boolean("stripe_details_submitted").default(false).notNull(),
	stripeChargesEnabled: boolean("stripe_charges_enabled").default(false).notNull(),
	stripePayoutsEnabled: boolean("stripe_payouts_enabled").default(false).notNull(),
	stripeRequirements: jsonb("stripe_requirements"),
	stripeAccountLinkExpiresAt: timestamp("stripe_account_link_expires_at", { mode: 'string' }),
	stripeDefaultCurrency: text("stripe_default_currency"),
	externalAccountLast4: text("external_account_last4"),
	referralCode: text("referral_code").notNull(),
	referredBy: varchar("referred_by"),
	referralSource: text("referral_source"),
	bio: text(),
	profilePhoto: text("profile_photo"),
	socialLinks: jsonb("social_links"),
	adminNotes: text("admin_notes"),
	tosAcceptedAt: timestamp("tos_accepted_at", { mode: 'string' }),
	tosIpAddress: text("tos_ip_address"),
	tosVersion: text("tos_version"),
	isFeaturedEligible: boolean("is_featured_eligible").default(false).notNull(),
	featuredPriority: integer("featured_priority").default(0).notNull(),
	featuredPinnedUntil: timestamp("featured_pinned_until", { mode: 'string' }),
	lastFeaturedAt: timestamp("last_featured_at", { mode: 'string' }),
	registrationUpscalesUsed: integer("registration_upscales_used").default(0).notNull(),
	monthlyUpscalesUsed: integer("monthly_upscales_used").default(0).notNull(),
	lastUpscaleResetAt: timestamp("last_upscale_reset_at", { mode: 'string' }),
	lifetimeUpscalesProcessed: integer("lifetime_upscales_processed").default(0).notNull(),
	totalUpscaleCostCents: integer("total_upscale_cost_cents").default(0).notNull(),
	deletedAt: timestamp("deleted_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("artists_subscription_status_idx").using("btree", table.subscriptionStatus.asc().nullsLast().op("text_ops")),
	index("artists_subscription_tier_idx").using("btree", table.subscriptionTier.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.referredBy],
			foreignColumns: [table.id],
			name: "artists_referred_by_fkey"
		}),
	unique("artists_email_key").on(table.email),
	unique("artists_stripe_customer_id_key").on(table.stripeCustomerId),
	unique("artists_stripe_subscription_id_key").on(table.stripeSubscriptionId),
	unique("artists_referral_code_key").on(table.referralCode),
]);

export const artworks = pgTable("artworks", {
	id: varchar().default(gen_random_uuid()).primaryKey().notNull(),
	artistId: varchar("artist_id").notNull(),
	title: text().notNull(),
	description: text(),
	tags: text().array().default(["RAY"]).notNull(),
	imageUrl: text("image_url").notNull(),
	status: text().default('pending').notNull(),
	rejectionReason: text("rejection_reason"),
	ipDeclarationAccepted: boolean("ip_declaration_accepted").default(false).notNull(),
	ipDeclarationText: text("ip_declaration_text"),
	artworkStory: text("artwork_story"),
	styleTags: text("style_tags").array().default(["RAY"]),
	suggestedUse: text("suggested_use"),
	seoSlug: text("seo_slug"),
	shopifyProductId: text("shopify_product_id"),
	shopifyProductStatus: text("shopify_product_status").default('draft'),
	shopifyTemplate: text("shopify_template"),
	shopifyCollectionHandle: text("shopify_collection_handle"),
	productType: text("product_type").default('art_print').notNull(),
	printifyProductId: text("printify_product_id"),
	printifyImageId: text("printify_image_id"),
	lastSaleDate: timestamp("last_sale_date", { mode: 'string' }),
	archivedAt: timestamp("archived_at", { mode: 'string' }),
	archiveWarningEmailSentAt: timestamp("archive_warning_email_sent_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.artistId],
			foreignColumns: [artists.id],
			name: "artworks_artist_id_fkey"
		}),
]);

import { relations } from 'drizzle-orm';

export const artistsRelations = relations(artists, ({ many }) => ({
	artworks: many(artworks),
}));

export const artworksRelations = relations(artworks, ({ one }) => ({
	artist: one(artists, {
		fields: [artworks.artistId], // Check if your column is named 'artistId' or 'authorId'
		references: [artists.id],
	}),
}));