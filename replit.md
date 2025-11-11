# 3six9 Media Masters - Creator Platform Ecosystem

## Overview
3six9 Media Masters LLC operates two creator-focused platforms:
- **247 Print Network (POD Marketplace):** An artist-powered print-on-demand marketplace integrating with Printify for automated fulfillment. Artists upload artwork, which is converted into POD products, earning tiered royalties (30-45%). The platform emphasizes creator-driven marketing and recruitment with automated royalty payouts.
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
- **Shopify Integration:** Automated product creation, order capture via HMAC-verified webhooks (including idempotency for purchases), enriched product creation, and automated theme/navigation deployment. Full navigation system with responsive header/footer sections featuring desktop dropdown menus and mobile hamburger drawer with accordion-style submenus.
- **Printify Integration:** Automated Print-on-Demand product creation.
- **Stripe Connect:** For automated artist royalty payouts.
- **Email Notifications:** Resend integration for transactional emails with professional templates, delivery logging, and non-blocking sends.
- **Artwork Management:** Automated archiving of inactive artworks, product type assignment with smart tagging.
- **Royalty System:** Tiered royalties (30-45%), referral bonuses (+5%), and recruitment bonuses (5% of recruited artist's royalties).
- **Security:** HMAC verification for webhooks, rate limiting, audit logging, and soft-delete for accounts.
- **Analytics & Reporting:** Artist dashboard with KPIs, earnings, and progress; Admin dashboard for revenue and network growth.

## External Dependencies
- **Replit PostgreSQL Database:** Serverless PostgreSQL (Neon-powered).
- **OpenAI API:** DALL-E 3 for AI image generation (via Replit AI Integrations) and GPT-4o for content generation (via Replit AI Integrations).
- **Printify API:** For Print-on-Demand product creation and fulfillment.
- **Shopify Admin API:** For storefront product management, order capture, and theme/navigation automation.
- **Stripe Connect:** For automated artist payouts and subscription management.
- **Resend:** For transactional email notifications.
- **Node.js:** Backend runtime environment.