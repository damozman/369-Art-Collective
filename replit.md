# 3six9 Media Masters - Creator Platform Ecosystem

## Overview
3six9 Media Masters LLC operates two creator-focused platforms:
- **247 Print Network (POD Marketplace):** An artist-powered print-on-demand marketplace integrating with Printify for automated fulfillment. Artists upload artwork, which is converted into POD products, earning tiered royalties (30-45%). The platform emphasizes creator-driven marketing and recruitment with automated royalty payouts and intelligent featured artist rotation.
- **247 CreatorStack (Digital Products & AI Tools):** A digital product platform offering AI-powered kits and tools for solopreneurs. These kits, such as "Social Media Blitz," combine Canva templates with AI prompt libraries (e.g., GPT-4o powered caption generators) to automate content creation and audience growth. The business model includes one-time kit purchases and a planned monthly "Pro Membership." The goal is to provide quick, actionable solutions for time-strapped entrepreneurs.

The project aims to achieve $5K/month recurring revenue through multiple kits and memberships, leveraging an ultra-lean tech stack.

## User Preferences
I want the agent to adopt an iterative development approach, focusing on delivering functional components incrementally. When making significant changes or architectural decisions, please ask for my approval first. I prefer clear, concise explanations and expect the agent to maintain a high standard of code quality, adhering to the established tech stack and design patterns.

## System Architecture
The system employs a client-server architecture with distinct frontend and backend components, designed for scalability and maintainability.

**UI/UX:**
- **Frontend Technologies:** React, TypeScript, Wouter for routing, TanStack Query for data fetching, React Hook Form, Tailwind CSS, and Shadcn UI.
- **Artist & Admin Interfaces:** Dedicated workflows for artists (artwork upload wizard, AI Art Studio with DALL-E 3, credit system) and administrators (enhanced dashboards for management, search, filtering, bulk operations).
- **CreatorStack Buyer Interface:** Public landing page (`/creatorstack`), secure authentication (`/creatorstack/login`), and a buyer dashboard (`/creatorstack/dashboard`) for accessing purchased kits and AI tools.
- **Shopify Storefront:** Custom `247-art.css` with a Displate-inspired aesthetic, featuring artist spotlights, interactive product selectors, multi-image galleries, and mobile responsiveness. Automated deployment and navigation setup via scripts.
- **Influencer Affiliate Program:** Public application, tiered commissions (20-40%), global `?ref=` link tracking with 30-day cookie attribution, and an influencer dashboard displaying metrics and tier progress. Includes a gamification system with achievements, a leaderboard, and an activity feed.
- **Customer-Facing Pages:** Displate-inspired pages including About Us, Meet the Creators (artist directory), Artist Profile Pages, Contact Us, FAQs, Join the Creatorverse (artist recruitment), and optimized product pages.
- **Merch Cross-Sell System:** Strategic promotion of merchandise on product pages and homepage, maintaining an art-first positioning with "Coming Soon" features.

**Technical Implementations:**
- **Backend Framework:** Node.js.
- **Database:** PostgreSQL (Neon-powered) with Drizzle ORM.
- **Authentication:** Session-based with HTTP-only cookies, bcrypt hashing, CSRF protection, and separated login architectures for different user types.
- **API Endpoints:** Comprehensive RESTful APIs for platform operations, including `/api/creatorstack/*` for buyer authentication, purchases, and AI generation.
- **AI Generation System:** Integration with OpenAI DALL-E 3 (for Print Network) and GPT-4o (for CreatorStack) via Replit AI Integrations. Features include a dual-balance credit system, image storage, retry logic, token usage tracking, and API routes for credit management.
- **Shopify Integration:** Automated product creation, order capture via HMAC-verified webhooks (including idempotency for purchases), enriched product creation, and automated theme/navigation deployment. Full navigation system with responsive header/footer sections featuring desktop dropdown menus and mobile hamburger drawer with accordion-style submenus. Navigation script uses GraphQL for collections (REST deprecated in 2025-01), automatically verifies/updates page templates, and maintains proper Shopify resource IDs for all menu items. Custom list-collections template displays only curated collections (Featured, New Arrivals, Metal/Canvas/Poster/Framed Prints) instead of all 179+ auto-generated collections. **Product Structure:** All 88 products now offer 16 variants (4 sizes × 4 finishes) aligned with Printify's actual catalog: Posters (Paper finish), Canvas Prints, Framed Prints, and Metal Prints. SKU format: `ART-{artistInitials}-{artworkUUID}-{size}-{finish}`. Smart Collections auto-populate via finish tags for seamless catalog organization.
- **Printify Integration:** Automated Print-on-Demand product creation aligned with 4 wall art product types: Posters (Blueprint 852), Canvas (Blueprint 555), Framed Prints (Blueprint 492), and Metal Signs (Blueprint 1206). Products maintain proper weights (0.25-7.0 lb) and pricing ($19-209) for accurate shipping and fulfillment.
- **Stripe Connect:** For automated artist royalty payouts.
- **Email Notifications:** Resend integration for transactional emails with professional templates, delivery logging, and non-blocking sends.
- **Artwork Management:** Automated archiving of inactive artworks, product type assignment with smart tagging.
- **Royalty System:** Dual-tier royalty structure combining performance and subscription tiers using Math.max logic. Performance tiers: Tier 1 ($0-999) = 30%, Tier 2 ($1K-5K) = 35%, Tier 3 ($5K-10K) = 40%, Tier 4 ($10K+) = 45%. Subscription tiers: Free = 30%, Pro = 35% minimum, Elite = 45% guaranteed. Artists receive whichever percentage is higher between their performance and subscription tier. Referral bonuses (+5%) and recruitment bonuses (5% of recruited artist's royalties) apply on top.
- **Artist Subscription Tiers:** Three-tier monetization system with recurring billing via Stripe. Free ($0/mo, 30% royalty, 20 artwork limit), Pro ($15-20/mo, 35% minimum royalty, unlimited uploads, AI Art Studio access, homepage featured eligibility), Elite ($40-50/mo, 45% guaranteed royalty, unlimited uploads, full AI tools, profile customization, guaranteed homepage featured placement). Database tracks subscriptionTier, stripeCustomerId, stripeSubscriptionId, subscriptionStatus, subscriptionPeriodEnd, isFeaturedEligible, featuredPriority (0-100), and featuredPinnedUntil.
  - **Production-Ready Features:** 
    - Database optimization: Unique indexes on stripeCustomerId/stripeSubscriptionId, regular indexes on tier/status for high-volume lookups
    - Rate limiting: 10 mutations/hour, 100 reads/15min per IP to prevent abuse
    - Idempotency: Client-side key generation with useRef, reused across retries, Stripe 24-hour deduplication
    - Type safety: Proper Stripe types (Subscription, Invoice, PaymentIntent) with runtime guards, no `any` casts
    - Error logging: Structured [SUCCESS]/[ERROR]/[WARN] format with context (artistId, email, tier, duration), stack traces preserved
    - Route ordering: Subscription routes before parameterized routes to prevent conflicts (backend: line 667 vs 800+, frontend: line 252)
    - Secure logout: Backend destroys session + clears cookie, frontend calls API endpoint before navigation
    - Automated featured artist rotation: Tier changes automatically update featured eligibility and priority via Stripe webhooks
- **Featured Artist System:** Intelligent homepage placement based on subscription tier and performance. Elite members get automatic homepage placement (priority 100), Pro members are eligible with approval (priority 50+), Free members require manual admin promotion (priority 0-25). System includes pinning capability for guaranteed placement until specified date. API endpoint GET /api/featured-artists returns sorted artists for Shopify theme integration. Backfill script (scripts/backfill-featured-artists.ts) available for setting initial featured status.
- **Security:** HMAC verification for webhooks, rate limiting, audit logging, soft-delete for accounts, and production-hardened authentication with proper session destruction. Secure logging with sensitive data sanitization (session IDs, API keys, Stripe objects).
- **Analytics & Reporting:** Artist dashboard with KPIs, earnings, and progress; Admin dashboard for revenue and network growth.
- **Email System:** Comprehensive email templates with shared layout system (13 templates total). Critical templates include: subscription confirmation, payment failed, payout notification, artist approval, artwork approval, and buyer purchase confirmation. All emails logged to `emailLogs` table with metadata for audit trails. Idempotency guards prevent duplicate sends on webhook retries by checking `subscriptionId` and `invoiceId` metadata.
- **Production Readiness:** Health check endpoint (`/api/health`) validates all 6 integrations (Database, Stripe, Shopify, Printify, OpenAI, Email). Comprehensive deployment runbook (`DEPLOYMENT.md`) with integration setup instructions, troubleshooting guides, and rollback procedures. Environment configuration documented in `.env.example`.

## External Dependencies
- **Replit PostgreSQL Database:** Serverless PostgreSQL (Neon-powered).
- **OpenAI API:** DALL-E 3 for AI image generation (via Replit AI Integrations) and GPT-4o for content generation (via Replit AI Integrations).
- **Printify API:** For Print-on-Demand product creation and fulfillment.
- **Shopify Admin API:** For storefront product management, order capture, and theme/navigation automation.
- **Stripe Connect:** For automated artist payouts and subscription management.
- **Resend:** For transactional email notifications.
- **Node.js:** Backend runtime environment.