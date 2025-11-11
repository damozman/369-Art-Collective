# 3six9 Media Masters - Creator Platform Ecosystem

## Overview
The platform operates two complementary creator-focused businesses under 3six9 Media Masters LLC:

### 247 Print Network (POD Marketplace)
An artist-powered print-on-demand marketplace enabling artists to upload artwork, which is automatically converted into POD products via Printify after administrative approval. The platform manages automated fulfillment, a tiered royalty payout system (30-45%), and aims to be a creator-powered marketplace. Artists are encouraged to drive product creation, marketing through referrals, and recruitment, supported by automated royalties and a zero-inventory POD model.

### 247 CreatorStack (Digital Products & AI Tools)
A digital product platform selling AI-powered kits and tools to busy solopreneurs (bloggers, coaches, Etsy sellers) who need to automate content creation, grow audiences, and monetize quickly. Products include ready-to-use Canva templates bundled with AI prompt libraries for social media, email marketing, and content creation.

**Products:**
- **AI Kits** ($47 one-time): Bundled templates + AI prompts (e.g., "Social Media Blitz" with 50 Canva templates + GPT-powered caption generator, "Email Launch Rocket" with Beehiiv sequences + AI copywriting)
- **Pro Membership** ($29/mo - planned): All kits + monthly AI updates, community access, custom prompts

**Target Audience:** Time-strapped solopreneurs needing quick wins (30 days of social posts in 5 min/day, email sequences launched in hours)

**Business Model:**
- Phase 1 (MVP): Single $47 kit to validate demand ($500-1K proof of concept)
- Phase 2 (Scale): Multiple kits + $29/mo Pro memberships targeting $5K/mo recurring revenue
- Revenue Split: 80% kits early, shift to memberships for recurring income

**Tech Stack (Ultra-Lean):**
- Shopify (existing): Digital product sales, payments, delivery
- Replit (existing): Backend, AI prompt generation, buyer dashboards, webhook handling
- OpenAI GPT-4o (Replit AI Integrations): Content generation for kits
- Canva Pro (existing): Template creation
- Beehiiv (free tier): Email nurturing

**Key Automations:**
- Shopify purchase → Webhook → Replit unlocks kit access
- AI prompt generator: Live GPT-4o integration for on-demand content
- Buyer dashboard: Login to access purchased kits and AI tools

**Frontend Pages (Completed):**
- `/creatorstack` - Public landing page showcasing AI kits with hero section, benefits, kit cards ($47 each), testimonials
- `/creatorstack/login` - Authentication page with login/registration toggle for buyers
- `/creatorstack/dashboard` - Buyer dashboard showing purchased kits, access to Canva templates and AI prompt libraries

**Backend API (In Progress):**
- `/api/creatorstack/auth/*` - Registration, login, logout for buyers
- `/api/creatorstack/buyer/me` - Get authenticated buyer with purchases
- `/api/creatorstack/webhooks/shopify` - Handle Shopify order webhooks to unlock kit access
- `/api/creatorstack/purchases/*` - Track kit access and download counts
- `/api/creatorstack/ai/generate` - GPT-4o prompt generation endpoint

## Upcoming Features (Future Development)
- **Customer Savings Plan / Membership Program**: Build a subscription or membership system for customers (savings plans, member benefits, loyalty rewards, etc.)
- **Customer Product Credits/Incentives**: Offer store credits to customers for products as incentives or contest winnings
- **Customer Artist Favorites**: Allow customers to save/favorite artists for follow updates and personalized recommendations
- **Platform Logo Design**: Create professional logo for 247 Print Network branding

## User Preferences
I want the agent to adopt an iterative development approach, focusing on delivering functional components incrementally. When making significant changes or architectural decisions, please ask for my approval first. I prefer clear, concise explanations and expect the agent to maintain a high standard of code quality, adhering to the established tech stack and design patterns.

## System Architecture
The platform employs a clear separation between frontend and backend.

**UI/UX:**
- **Frontend:** Built with React, TypeScript, Wouter for routing, TanStack Query for data fetching, React Hook Form, and styled with Tailwind CSS and Shadcn UI components.
- **Artist Workflow:** Includes a multi-step artwork upload wizard, product activation/deactivation, and an AI Art Studio for DALL-E 3 image generation with a credit system, generation history, and direct upload/download options.
- **Admin Workflow:** Features enhanced dashboards for artwork and artist management, including advanced search, filtering, bulk operations, CSV export, and CRM notes.
- **Featured Testimonials:** A hybrid system for homepage placement combining manual overrides, premium paid placements, and merit-based rotation with legal consent and audit trails.
- **Influencer Affiliate Program:**
    - **Application & Approval:** Public application and admin review workflow.
    - **Tiered Commissions:** Bronze to Elite tiers (20-40% based on monthly sales).
    - **Affiliate Link Tracking:** Global middleware for `?ref=` parameter capture, click logging with UTM data, and 30-day HTTP-only cookie attribution.
    - **Conversion Tracking:** Supports `artist_signup` and `sale` conversions with commission tracking.
    - **Influencer Dashboard:** Displays performance metrics, tier progress, affiliate link sharing, and getting started guidance.
    - **Gamification System:** Automated achievement system with 13 achievements, a public leaderboard, an activity feed, and admin challenges management (CRUD UI for challenges, various challenge types, prize structures).
    - **Database:** Includes tables for achievements, influencerAchievements, challenges, challengeParticipants, and activityFeedEvents.

**Technical Implementations:**
- **Artist & Admin Management:** Role-based access control, secure password reset, rate limiting, audit logging, and soft-delete for artist accounts.
- **AI Generation System:** Integrates OpenAI DALL-E 3 via Replit AI Integrations, features a dual-balance credit system (`freeCredits`, `paidCredits`), handles image storage, error resilience with automatic credit refunds, and provides API routes for credit management and generation history.
- **Artwork Archive System:** Automates archiving of inactive artworks (18+ months no sales) with pre-archive email warnings and reactivation options for both artists and admins. Shopify webhook updates `lastSaleDate`.
- **Product Type System:** Automatically assigns Shopify templates and adds smart tags based on `productType` (e.g., "art_print"), designed for future expansion to other POD categories.
- **Automated Integrations:**
    - **Printify:** Automated POD product creation.
    - **Shopify:** Integration for storefront product management, order capture via webhooks, enriched product creation, and automated theme deployment (`scripts/deploy-shopify-theme.js`).
    - **Shopify Theme Design:** Custom `247-art.css` with a Displate-inspired aesthetic (#6366f1 accent, #0f0f0f blacks, pill-shaped buttons, layered shadows), artist spotlight, interactive grid-based option selectors, multi-image gallery system for Printify POD products with variant-to-image mapping, and robust mobile responsiveness.
    - **Merch Cross-Sell System:** Strategic merchandise promotion maintaining art-first positioning with "Coming Soon" badges for future expansion:
        - **Product Page Upsell:** `247-merch-upsell.liquid` snippet shows 4 merch products (t-shirts, mugs, tote bags, phone cases) at bottom of art product pages with disabled "Notify Me" buttons
        - **Homepage Preview:** `247-merch-preview.liquid` section displays 3 merch categories (Apparel, Home & Living, Accessories) with "Join Waitlist" CTA, positioned between Featured Artists and Trust Badges
        - **Premium Styling:** Consistent gradient text, hover-lift cards, indigo accents matching Displate-inspired aesthetic
        - **Mobile Responsive:** Auto-fit grids with breakpoints for optimal viewing across devices
    - **Customer-Facing Pages:** Complete Displate-inspired storefront with modern 2024/2025 aesthetic:
        - **About Page:** Mission statement, how-it-works process (4-step cards), platform benefits, fair royalty system
        - **Meet the Creators:** Artist directory with profile cards, artwork counts, collection links
        - **Artist Profile Pages:** Public-facing artist profiles at `/artists/:id` with bio, artwork gallery, sales stats, and Shopify collection links (approved artists only)
        - **Contact Us:** Professional contact form with email/response time info, success/error handling
        - **Help/FAQs:** Interactive accordion with categories (Orders, Shipping, Artists, Products)
        - **Join the Creatorverse:** Artist recruitment landing page with royalty tiers, benefits cards, prominent CTAs
        - **Product Pages:** Two-column layout (image left, info right) with multi-image gallery, variant-to-image switching, lightbox zoom
        - **Homepage Integration:** Shopify homepage links to 4 collections (Abstract Art, Nature & Landscapes, Urban & Street, Pop Culture) and 3 featured artist profiles
- **Royalty System:** Tiered royalties (30-45%), referral bonuses (+5% for UTM-tracked sales), and recruitment bonuses (5% of recruited artist's royalties).
- **Payouts:** Stripe Connect Express for automated artist payouts, including webhook integration and admin management UI.
- **Security:** Session-based authentication with HTTP-only cookies, session regeneration, CSRF protection, bcrypt password hashing, and separated login architectures.
- **Database:** PostgreSQL (Neon-powered) with Drizzle ORM.
- **File Uploads:** Multer for image uploads with quality validation and server-side cleanup.
- **API Endpoints:** Comprehensive RESTful APIs for platform management.
- **Email Notifications:** Resend integration for transactional emails with professional HTML templates, delivery logging, and non-blocking sends.
- **Analytics & Reporting:** Artist Dashboard with KPIs, earnings breakdown, top artworks, and tier progress. Admin Empire Dashboard with high-level revenue metrics, network growth, and payout processing.
- **Referral Tracking:** Affiliate links with UTM tracking for artist recruitment and testimonials, linking shared content to recruitment and bonuses.

## External Dependencies
- **Replit PostgreSQL Database:** Serverless PostgreSQL (Neon-powered).
- **OpenAI API:** DALL-E 3 for AI image generation (via Replit AI Integrations).
- **Printify API:** For POD product creation and fulfillment.
- **Shopify Admin API:** For storefront product management and order capture.
- **Stripe Connect:** For automated artist payouts and subscription management.
- **Resend:** For transactional email notifications.
- **Node.js:** Backend runtime environment.