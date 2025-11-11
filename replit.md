# 247 Print Network - Artist Portal & POD Marketplace

## Overview
The 247 Print Network is an artist-powered print-on-demand (POD) marketplace. Its core purpose is to enable artists to upload artwork, which, upon administrative approval, is automatically transformed into POD products via Printify integration. The platform handles automated fulfillment and a tiered royalty payout system. The vision is to build a creator-powered marketplace where artists drive product creation, marketing through referrals, and recruitment, supported by automated royalties and a zero-inventory POD model.

## User Preferences
I want the agent to adopt an iterative development approach, focusing on delivering functional components incrementally. When making significant changes or architectural decisions, please ask for my approval first. I prefer clear, concise explanations and expect the agent to maintain a high standard of code quality, adhering to the established tech stack and design patterns.

## System Architecture
The platform features a clear separation between frontend and backend.

**UI/UX:**
- **Frontend:** React with TypeScript, Wouter for routing, TanStack Query for data fetching, React Hook Form for forms, and Tailwind CSS with Shadcn UI components for styling.
- **Artist Workflow:** Multi-step artwork upload wizard, product deactivation/activation, AI Art Studio for generating artwork using OpenAI DALL-E.
- **AI Art Studio (Artist Portal):**
    - **Credit System:** 10 free generations per artist, option to purchase additional credits at $0.50/generation
    - **Generation Interface:** Prompt-based artwork creation with size selection (256×256 to 1792×1792)
    - **Credit Management:** Dual-balance system (free credits used first, then paid credits)
    - **History Tracking:** Complete generation history with thumbnails, prompts, dimensions, and status
    - **Download & Upload:** Generated images can be downloaded locally or uploaded directly as artist submissions
    - **Error Resilience:** Automatic credit refunds on generation failures, graceful API error handling
    - **Bootstrap:** Test artist (artist@example.com / artist123) auto-created in dev/test with approved status and 10 free credits
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
    - **Gamification System (Complete Implementation):**
        - **Automated Achievement System:**
            - 13 achievements seeded with 7 criteria types: total_conversions, total_earnings, artists_recruited, tier_reached, conversion_rate, first_sale_days, conversions_in_hours
            - Achievement service (`server/achievement-service.ts`) automatically checks and unlocks achievements when influencers hit milestones
            - Trigger points: conversion creation, tier upgrades, artist recruitment
            - Instant unlock notifications with activity feed event creation
            - Rarity tiers: common, uncommon, rare, epic, legendary (10-500 points)
        - **Leaderboards:** 
            - Public leaderboard at `/leaderboard` with tabbed interface (Leaderboard + Activity Feed tabs)
            - Real-time rankings with metric filters (earnings, conversions, clicks) and period filters (all-time, monthly, weekly)
            - Top 3 performers highlighted with visual badges and tier indicators
            - Null-safe rendering with graceful fallback states
        - **Activity Feed:**
            - Public feed of recent achievement unlocks and notable events at `/api/activity-feed`
            - Automatically populated when achievements unlock via storage layer
            - Event types: achievement_unlocked, tier_upgrade, big_sale, challenge_win, new_rank
            - Display format: "{icon} {influencerName} unlocked "{achievementName}"!" with timestamps
            - Newest events first (DESC ordering), configurable limit (default 20)
        - **Admin Challenges Management:**
            - Full CRUD admin UI at `/admin/challenges` with create form, listing, and status management
            - Backend API routes: GET/POST `/api/admin/challenges`, PATCH `/api/admin/challenges/:id/status`
            - Challenge types: most_sales, fastest_to_x, highest_conversion, team_battle
            - Metrics: conversions, earnings, clicks, conversion_rate
            - Prize structure: 1st/2nd/3rd place monetary prizes + optional prize descriptions
            - Status workflow: upcoming → active → completed/cancelled
            - Participant tracking and challenge-specific leaderboards
        - **Influencer Dashboard Integration:**
            - Achievement badges display with unlock dates and progress tooltips
            - Tier ladder visualization showing current tier and path to next level
            - Active challenges section with join functionality
            - Points leaderboard and ranking display
        - **Navigation:**
            - Admin: "Influencer Marketing" sidebar section → "Influencers" + "Challenges" links
            - Public: `/leaderboard` accessible to all for competitive visibility and influencer recruitment
        - **Database Schema:** achievements, influencerAchievements, challenges, challengeParticipants, activityFeedEvents tables with proper foreign keys and indexes

**Technical Implementations:**
- **Artist & Admin Management:** Role-based access control, secure self-service password reset, rate limiting on critical endpoints, and audit logging. Soft-delete system for artist accounts.
- **AI Generation System:**
    - **OpenAI Integration:** DALL-E 3 model via Replit AI Integrations (auto-configured API keys)
    - **Credit Architecture:** `aiCredits` table with dual-balance tracking (freeCredits, paidCredits), `aiGenerations` table for history
    - **Generation Service:** `server/ai-service.ts` handles OpenAI API calls, image storage (base64 → data URLs), error handling, and automatic credit refunds
    - **Smart Refunds:** When generation fails, credits are returned to the same balance they were deducted from (free vs paid)
    - **API Routes:** GET `/api/ai/credits`, POST `/api/ai/generate`, GET `/api/ai/generations`
    - **Frontend:** `/artist/ai-studio` with real-time credit balance, generation form, latest result display, and paginated history
    - **Test Data:** Bootstrap creates test artist with approved status and 10 free credits (dev/test only)
- **Artwork Archive System:**
    - **Automated Lifecycle Management:** Identifies inactive artworks (18+ months with zero sales) and automatically archives them to maintain marketplace freshness
    - **Email Notifications:** Resend-powered email service sends warning notifications 30 days before archiving, plus archive confirmation emails with reactivation instructions
    - **Database Tracking:** `archivedAt`, `lastSaleDate`, `archiveWarningEmailSentAt` fields on artworks table; Shopify webhook updates lastSaleDate on every order
    - **Archive Service:** `server/archive-service.ts` class handles warning emails, archiving workflow, and stats aggregation
    - **Admin Dashboard:** `/admin/archived` page with search/filter, stats (total archived, warnings sent, never sold, avg. days), manual "Run Archive Check" button, and individual reactivate buttons
    - **Artist Portal:** Dual-tab interface (Active/Archived) in `/artist/dashboard` with grayed-out images, red badges, and confirmation-gated reactivation workflow
    - **API Routes:** 
        - Admin: GET `/api/artworks/archived`, POST `/api/artworks/:id/reactivate`, POST `/api/archive/check`
        - Artist: GET `/api/artworks/my-archived`, POST `/api/artworks/:id/my-reactivate` (ownership-verified)
    - **Soft Archive Approach:** Database records preserved, Shopify marketplace removal (TODO), reactivation allowed with one-click workflow
    - **Cache Invalidation:** TanStack Query properly invalidates both active and archived caches on reactivation for instant UI updates
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
- **OpenAI API:** DALL-E 3 for AI image generation via Replit AI Integrations (auto-configured via `AI_INTEGRATIONS_OPENAI_BASE_URL` and `AI_INTEGRATIONS_OPENAI_API_KEY`).
- **Printify API:** For creating POD products and managing fulfillment.
- **Shopify Admin API:** For storefront product management and order capture via webhooks.
- **Stripe Connect:** For automated artist payouts, subscription management for featured placements, and webhook integration for status updates.
- **Resend:** For sending transactional email notifications.
- **Node.js:** Runtime environment for the backend.