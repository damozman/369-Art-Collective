# 247 Print Network - Artist Portal & POD Marketplace

## Overview
The 247 Print Network is an artist-powered print-on-demand (POD) marketplace. Its core purpose is to enable artists to upload their artwork, which, upon administrative approval, is automatically transformed into POD products via Printify integration. The platform handles automated fulfillment and a tiered royalty payout system. The vision is to build a creator-powered marketplace where artists drive product creation, marketing through referrals, and recruitment, all supported by automated royalties and a zero-inventory POD model.

## User Preferences
I want the agent to adopt an iterative development approach, focusing on delivering functional components incrementally. When making significant changes or architectural decisions, please ask for my approval first. I prefer clear, concise explanations and expect the agent to maintain a high standard of code quality, adhering to the established tech stack and design patterns.

## System Architecture
The platform is built with a clear separation between frontend and backend.
**UI/UX:** The frontend utilizes React with TypeScript, Wouter for routing, TanStack Query for data fetching, React Hook Form for forms, and Tailwind CSS with Shadcn UI components for styling, ensuring a responsive and modern user experience.
**Technical Implementations:**
- **Artist Workflow:** Artists register, submit a portfolio for admin approval, then upload artwork, track its status, and manage product visibility.
  - **Multi-Step Artwork Upload Wizard:** 5-step guided upload flow (Image Upload → Basic Details → Marketing Content → IP Declaration → Review) with progress tracking, real-time validation, and enhanced marketing fields (artworkStory, styleTags, suggestedUse) for richer Shopify product pages. Server auto-generates SEO-friendly slugs from artwork titles.
- **Admin Workflow:** Admins manage artist accounts, approve/reject artists, and review/approve artwork submissions, which triggers Shopify product creation.
  - **Admin CRM Notes:** Private notes field on each artist's detail page for tracking calls, conversations, preferences, and relationship management (personal CRM functionality).
  - **Enhanced Artwork Management Dashboard:**
    - **Advanced Search & Filtering:** Real-time search by artwork title, artist name, or email with instant results
    - **Multi-Sort Options:** Sort artworks by newest/oldest, artist name A-Z/Z-A
    - **Bulk Selection System:** Individual checkboxes per artwork card, "Select All" for filtered results
    - **Bulk Operations:** Approve or reject multiple artworks simultaneously with shared rejection reasons
    - **Selection Safety:** Automatic selection clearing when filters, search, or sort changes to prevent accidental operations on hidden artworks
    - **Sequential Processing:** Backend processes bulk operations one-by-one to avoid Shopify API rate limits
    - **Success Tracking:** Detailed toast notifications showing success/failure counts for bulk operations
    - **Fixed Action Bar:** Bottom-anchored controls appear when items selected, showing count and bulk action buttons
  - **Enhanced Artist Management Dashboard:**
    - **Advanced Search & Filtering:** Real-time search by artist name or email with instant results
    - **Status Filtering:** Filter artists by approval status (all, approved, pending)
    - **Multi-Sort Options:** Sort artists by newest/oldest, name A-Z/Z-A
    - **Bulk Selection System:** Individual checkboxes per artist, "Select All" for filtered results
    - **Bulk Operations:** Approve or reject multiple artists simultaneously with automated email notifications
    - **Batch Communications:** Send custom emails to multiple selected artists with subject and message composer
    - **CSV Export:** Download filtered artist data with proper quote escaping (Name, Email, Status, Joined Date, Referral Code)
    - **Selection Safety:** Automatic selection clearing when filters, search, or sort changes to prevent accidental operations on hidden artists
    - **Sequential Processing:** Backend processes bulk operations one-by-one to avoid email service rate limits
    - **Fixed Action Bar:** Bottom-anchored controls appear when artists selected, showing count and bulk action buttons (approve, reject, send email)
- **Printify Integration:** Approved artwork automatically creates Printify POD products.
- **Shopify Integration:** Shopify webhooks capture orders, and the platform integrates with the Shopify Admin API for storefront product management.
  - **Enhanced Product Creation:** When artwork is approved, Shopify products are enriched with marketing content:
    - **Rich Product Descriptions:** HTML-formatted descriptions include artwork story ("The Story Behind This Artwork"), suggested use ("Perfect For"), and artist attribution
    - **SEO-Friendly URLs:** Product handles use the artwork's SEO slug (e.g., "mountain-sunset-landscape") for better search discoverability
    - **Enhanced Tagging:** Style tags are added with "Style:" prefix (e.g., "Style:Modern", "Style:Abstract") for improved categorization and filtering
    - All marketing fields from the upload wizard automatically populate Shopify product pages for richer customer experience
- **Royalty System:** A tiered royalty system (30% to 45% based on monthly sales) is implemented, alongside a referral bonus (+5% for UTM-tracked sales) and a recruitment bonus (5% of recruited artist's royalties).
- **Stripe Connect Payouts:**
  - Artists onboard via Stripe Connect Express for automated payout capabilities
  - Artist settings page displays Stripe account status, bank details, and onboarding resume flow
  - Admin payout management UI displays all artists with unpaid earnings, Stripe connection status, and last payout details
  - Admins can trigger individual or batch payouts with $10 minimum threshold
  - Webhook system automatically syncs Stripe account status (account.updated events)
  - Payout status automatically updated via webhooks (transfer.created/updated/failed, payout.paid/payout.failed)
  - All webhook events use signature verification for security (STRIPE_WEBHOOK_SECRET)
- **Security:**
  - Session-based authentication with HTTP-only cookies, session regeneration, CSRF protection, bcrypt password hashing, and role-based access control.
  - Separated login architecture for artists and admins, preventing cross-exposure and ensuring distinct password reset flows.
  - Secure self-service password reset with cryptographically secure, single-use, time-limited tokens and rate limiting.
  - Rate limiting on critical endpoints (login, password reset).
  - Audit logging for security events.
- **Database:** Replit's built-in PostgreSQL database (Neon-powered) for persistent storage with Drizzle ORM.
- **File Uploads:** Multer handles image uploads, stored locally. Image quality validation enforces minimum resolution (2400x3000px) and supported formats (PNG, JPG) for print quality, with server-side validation and automatic cleanup of rejected files.
- **API Endpoints:** A comprehensive set of RESTful API endpoints manage authentication, artist management, artwork management, and admin analytics, including image URL normalization for consistent display across domains.
- **Account Deletion:** Soft-delete system for artist accounts, preserving historical data while preventing login for deleted accounts.
- **Product Deactivation/Activation:** Artists can control Shopify product visibility (draft/active) for their approved artworks via the platform.
- **Testimonials & Affiliate Tracking:**
  - Full CRUD system for managing artist success stories with video testimonials and social sharing
  - Affiliate link feature generates shareable URLs with UTM tracking (utm_source, utm_medium, utm_campaign, ref)
  - Success story pages capture referral parameters and preserve them through "Join as Artist" CTAs
  - Efficient LEFT JOIN implementation enriches testimonials with artist referral codes without data duplication
  - Complete attribution chain: share link → success story → registration → referral bonus tracking
  - **Referral Source Tracking:**
    - Registration captures utm_medium parameter to differentiate testimonial vs general referrals
    - Database stores referralSource field ("testimonial" or "general") for each recruited artist
    - Artist referral dashboard displays source breakdown stats (X from testimonial • Y general)
    - Recruited artists table shows color-coded source badges (green for testimonial, blue for general)
    - Frontend captures UTM params from URL and includes in registration POST body
    - Backend looks up referring artist by referral code and sets referredBy relationship
    - Each artist gets their own unique referral code (auto-generated) regardless of how they were recruited
  - **Legal Consent & Audit System:**
    - Required artistConsent boolean field with Zod validation (must be true before testimonial creation)
    - Consent metadata tracking: consentTimestamp (when granted), consentVersion (v1.0-2025), approvedByAdminId
    - Admin form displays prominent legal warning requiring explicit consent confirmation
    - Public success story pages display consent disclaimer confirming artist authorization
    - Complete audit trail protects platform from liability regarding testimonial usage rights
  - **Featured Placement Monetization System:**
    - Hybrid system with 7 total homepage slots combining manual overrides, premium paid placements, and merit-based rotation
    - Three-tier priority system: admin_override (tier 1) > premium (tier 2) > merit (tier 3)
    - Premium tier: Artists purchase featured placement via Stripe Checkout ($99/month subscription) with "Sponsored" badge
    - Admin override tier: Admins manually feature testimonials with "Featured" badge for editorial control
    - Merit tier: Top 5 artists by monthly earnings automatically featured (no badge, organic placement)
    - Database schema: featuredSubscriptions table tracks tier, Stripe subscription, status, and dates
    - Stripe webhook integration handles subscription lifecycle (checkout.session.completed, invoice.paid, subscription updates/cancellations)
    - Monthly auto-rotation cron job refreshes merit-based placements on 1st of each month
    - Artist dashboard displays current featured status with upgrade CTA for premium tier
    - Admin panel provides slot overview, tier-grouped placement lists, add/remove override controls, and warning alerts when ≥7 slots occupied
    - Homepage GET /api/featured-testimonials endpoint returns tier-sorted testimonials with proper badge display
    - Audit logging via featuredRotationLog table tracks all rotation events and manual overrides
    - Raw SQL implementation for featured testimonials query (bypasses Drizzle query builder to avoid SQL generation issues)
- **Email Notifications:**
  - Resend integration for transactional emails
  - Professional HTML + text email templates (welcome, password reset, portfolio decision, artwork decision)
  - Email delivery logging via emailLogs table
  - Non-blocking sends with error handling
  - Integrated into 6 endpoints: registration, portfolio approval, artwork approval/rejection, password resets (artist & admin)
- **Analytics & Reporting:**
  - **Artist Analytics Dashboard:** Comprehensive performance tracking with Recharts visualizations
    - KPI cards: Total earnings, monthly sales, tier progress, artwork submitted
    - Earnings breakdown pie chart (base royalties vs referral/recruitment bonuses) with negative value protection
    - Top 5 artworks bar chart (sorted by earnings) showing sales count and revenue per artwork
    - Artwork status distribution pie chart (approved/pending/rejected)
    - Tier progress indicator with next milestone calculation
    - Per-artwork performance endpoint (`/api/artists/:id/artwork-performance`) aggregates sales/earnings data
  - **Admin Empire Dashboard:** High-level network analytics
    - Revenue metrics: Total revenue, referral bonuses, recruitment bonuses
    - Network growth: Total artists, recruited artists count
    - Top performers tables: Highest earning artists with tier indicators
    - Top recruiters leaderboard: Recruitment count and earnings breakdown
    - Batch payout processing with status tracking

## External Dependencies
- **Replit PostgreSQL Database:** Serverless PostgreSQL (Neon-powered) for persistent storage.
- **Printify API:** For creating POD products and managing fulfillment.
- **Shopify Admin API:** For storefront product management and order capture via webhooks.
- **Stripe Connect:** For automated artist payouts, including webhook integration for status updates.
- **Node.js:** Runtime environment.