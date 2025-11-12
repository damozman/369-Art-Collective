# 3six9 Media Masters - Creator Platform Ecosystem

## Overview
3six9 Media Masters LLC operates two creator-focused platforms:
- **247 Print Network (POD Marketplace):** An artist-powered print-on-demand marketplace integrated with Printify, offering automated fulfillment and tiered royalties (30-45%). It focuses on creator-driven marketing, recruitment, and intelligent featured artist rotation.
- **247 CreatorStack (Digital Products & AI Tools):** A digital product platform providing AI-powered kits (e.g., "Social Media Blitz") for solopreneurs, combining Canva templates with AI prompt libraries (GPT-4o) to automate content creation. It offers one-time kit purchases and a planned "Pro Membership."

The project aims for $5K/month recurring revenue through multiple kits and memberships, utilizing an ultra-lean tech stack.

## User Preferences
I want the agent to adopt an iterative development approach, focusing on delivering functional components incrementally. When making significant changes or architectural decisions, please ask for my approval first. I prefer clear, concise explanations and expect the agent to maintain a high standard of code quality, adhering to the established tech stack and design patterns.

## System Architecture
The system uses a scalable client-server architecture with distinct frontend and backend components.

**UI/UX:**
- **Frontend Technologies:** React, TypeScript, Wouter, TanStack Query, React Hook Form, Tailwind CSS, and Shadcn UI.
- **Interfaces:** Dedicated workflows for artists (artwork upload, AI Art Studio), administrators (enhanced dashboards), and CreatorStack buyers (secure access to purchased kits and AI tools).
- **Shopify Storefront:** Custom `247-art.css` with a Displate-inspired aesthetic, featuring artist spotlights, interactive product selectors, and mobile responsiveness.
- **Influencer Affiliate Program:** Public application, tiered commissions (20-40%), global `?ref=` tracking with 30-day cookie attribution, and an influencer dashboard with gamification.
- **Customer-Facing Pages:** Displate-inspired About Us, Meet the Creators, Artist Profile Pages, Contact Us, FAQs, and optimized product pages.

**Technical Implementations:**
- **Backend Framework:** Node.js.
- **Database:** PostgreSQL (Neon-powered) with Drizzle ORM.
- **Authentication:** Session-based with HTTP-only cookies, bcrypt hashing, and CSRF protection.
- **API Endpoints:** Comprehensive RESTful APIs, including `/api/creatorstack/*` for buyer operations and AI generation.
- **AI Generation System:** Integration with OpenAI DALL-E 3 (for Print Network) and GPT-4o (for CreatorStack) via Replit AI Integrations, featuring a dual-balance credit system and token usage tracking.
- **Shopify Integration:** Automated product creation, order capture via HMAC-verified webhooks, and automated theme/navigation deployment (using GraphQL for collections). Product structure supports 16 variants per artwork, with smart collections for organization.
- **Printify Integration:** Automated Print-on-Demand product creation aligned with 4 wall art types (Posters, Canvas, Framed Prints, Metal Signs) with proper weights and pricing.
- **Stripe Connect:** For automated artist royalty payouts and subscription management.
- **Email Notifications:** Resend integration for transactional emails with professional templates and delivery logging.
- **Artwork Management:** Automated archiving and smart tagging for product type assignment.
- **Royalty System:** Dual-tier structure combining performance (30-45%) and subscription tiers, with referral and recruitment bonuses.
- **Artist Subscription Tiers:** Three tiers (Free, Pro, Elite) with recurring billing via Stripe. Includes a comprehensive free trial system with lifecycle management, Stripe webhook automation, a strategic email funnel, and a unified trial UI. Production-ready features include database optimization, rate limiting, idempotency, type safety, error logging, and secure logout.
- **Featured Artist System:** Hybrid performance and fair rotation logic for homepage placement, balancing top earners with equitable exposure for all eligible artists, managed via Stripe webhooks.
- **Security:** HMAC verification, rate limiting, audit logging, soft-delete, and production-hardened authentication.
- **Email System:** Comprehensive templates with a shared layout system, including a strategic email sequence to drive Free → Pro → Elite conversions.
- **Production Readiness:** Health check endpoint (`/api/health`) for 6 key integrations, and a detailed deployment runbook.
- **Mobile Accessibility:** WCAG 2.1 Level AAA compliance with 44px minimum touch targets across all interactive elements via foundational component library updates (e.g., buttons, inputs, select, checkbox, sidebar components, and links).

## External Dependencies
- **Replit PostgreSQL Database:** Serverless PostgreSQL (Neon-powered).
- **OpenAI API:** DALL-E 3 and GPT-4o (via Replit AI Integrations).
- **Printify API:** For Print-on-Demand fulfillment.
- **Shopify Admin API:** For storefront management.
- **Stripe Connect:** For payments and subscriptions.
- **Resend:** For transactional email services.
- **Node.js:** Backend runtime.