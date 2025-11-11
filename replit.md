# 247 Print Network - Artist Portal & POD Marketplace

## Overview
The 247 Print Network is an artist-powered print-on-demand (POD) marketplace. Its core purpose is to enable artists to upload artwork, which, upon administrative approval, is automatically transformed into POD products via Printify integration. The platform handles automated fulfillment and a tiered royalty payout system. The vision is to build a creator-powered marketplace where artists drive product creation, marketing through referrals, and recruitment, supported by automated royalties and a zero-inventory POD model.

## User Preferences
I want the agent to adopt an iterative development approach, focusing on delivering functional components incrementally. When making significant changes or architectural decisions, please ask for my approval first. I prefer clear, concise explanations and expect the agent to maintain a high standard of code quality, adhering to the established tech stack and design patterns.

## System Architecture
The platform features a clear separation between frontend and backend.

**UI/UX:**
- **Frontend:** React with TypeScript, Wouter for routing, TanStack Query for data fetching, React Hook Form for forms, and Tailwind CSS with Shadcn UI components for styling.
- **Artist Workflow:** Multi-step artwork upload wizard, product deactivation/activation.
- **Admin Workflow:** Enhanced dashboards for artwork and artist management with advanced search, filtering, sorting, bulk operations (approve/reject artists/artworks, send emails), and CSV export for artist data. Admin CRM notes for artist relationship management.
- **Featured Testimonials:** A hybrid system for homepage placement combining manual overrides, premium paid placements via Stripe Checkout, and merit-based rotation. Includes legal consent tracking and audit trails.
- **Influencer Affiliate Program:** 
    - **Application & Approval:** Public application form (`/influencer/apply`), admin review/approval workflow with status management (pending/active/suspended)
    - **Tiered Commissions:** Bronze/Silver/Gold/Platinum/Elite tier structure (20%-40% commission based on monthly sales: 0/5/20/50/100 thresholds)
    - **Affiliate Link Tracking:** Global middleware captures `?ref=` parameters, validates influencer status, logs clicks with UTM data (source, medium, campaign)
    - **Cookie Attribution:** 30-day HTTP-only secure cookie (247pn_affiliate) for cross-session tracking with sameSite=lax configuration
    - **Conversion Tracking:** Dual conversion types (artist_signup + sale) with nullable order fields for flexibility, tracks commission_earned and payout_status
    - **Registration Attribution:** Artist signups automatically linked to referring influencer via cookie, non-blocking error handling
    - **Dashboard:** 
        - Full-featured influencer portal (`/influencer/login`, `/influencer/dashboard`, `/influencer/pending`)
        - Performance metrics: total clicks, conversions, conversion rate, total earnings, pending earnings
        - Tier progress visualization with 5-tier ladder showing current status and next tier requirements
        - Affiliate link sharing with copy-to-clipboard functionality
        - Getting started guidance section
        - Null-safe rendering with graceful error states and fallback values
        - Session-based authentication integrated with platform-wide auth context
    - **Gamification System:**
        - **Leaderboards:** Real-time rankings with metric filters (earnings, conversions, clicks) and period filters (all-time, monthly, weekly). Top 3 performers highlighted with visual badges.
        - **Achievements/Badges:** 13 seeded achievements across categories (milestone, performance, special) with rarity levels (common, uncommon, rare, epic, legendary). Points system with unlock tracking and tooltips showing progress.
        - **Challenges:** Time-bound competitions with monetary prizes (1st/2nd/3rd place). Join functionality, participant tracking, and challenge leaderboards.
        - **Activity Feed:** Public feed of achievement unlocks and notable events to drive engagement.
        - **Public Leaderboard:** Accessible at `/leaderboard` for competitive visibility and influencer recruitment.
        - **Database Schema:** achievements, influencerAchievements, challenges, challengeParticipants, activityFeedEvents tables.

**Technical Implementations:**
- **Artist & Admin Management:** Role-based access control, secure self-service password reset, rate limiting on critical endpoints, and audit logging. Soft-delete system for artist accounts.
- **Automated Integrations:**
    - **Printify:** Automatic POD product creation from approved artwork.
    - **Shopify:** Integration for storefront product management, order capture via webhooks, and enriched product creation (rich descriptions, SEO-friendly URLs, enhanced tagging).
- **Royalty System:** Tiered royalties (30-45%), referral bonuses (+5% for UTM-tracked sales), and recruitment bonuses (5% of recruited artist's royalties).
- **Payouts:** Stripe Connect Express for automated artist payouts, including webhook integration for status updates and admin payout management UI.
- **Security:** Session-based authentication with HTTP-only cookies, session regeneration, CSRF protection, bcrypt password hashing, and separated login architectures. Deployment configuration for Replit's reverse proxy.
- **Database:** PostgreSQL (Neon-powered) with Drizzle ORM.
- **File Uploads:** Multer for image uploads with quality validation (resolution, format) and server-side cleanup.
- **API Endpoints:** Comprehensive RESTful APIs for platform management, including image URL normalization.
- **Email Notifications:** Resend integration for transactional emails with professional HTML templates, delivery logging, and non-blocking sends.
- **Analytics & Reporting:**
    - **Artist Dashboard:** KPIs, earnings breakdown (pie chart), top 5 artworks (bar chart), artwork status distribution, tier progress with Recharts visualizations.
    - **Admin Empire Dashboard:** High-level revenue metrics, network growth, top performers, top recruiters, and batch payout processing.
- **Referral Tracking:** Affiliate link feature with UTM tracking for artist recruitment and testimonials. Registration captures referral source, and a complete attribution chain links shared content to artist recruitment and referral bonuses.

## External Dependencies
- **Replit PostgreSQL Database:** Serverless PostgreSQL (Neon-powered) for persistent storage.
- **Printify API:** For creating POD products and managing fulfillment.
- **Shopify Admin API:** For storefront product management and order capture via webhooks.
- **Stripe Connect:** For automated artist payouts, subscription management for featured placements, and webhook integration for status updates.
- **Resend:** For sending transactional email notifications.
- **Node.js:** Runtime environment for the backend.