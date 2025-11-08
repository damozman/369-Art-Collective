# 247 CreatorStack - AI Automation Marketplace & Artist Portal

## Overview
The 247 CreatorStack is a dual-purpose platform:
1. **CreatorStack Marketplace**: A public marketplace for AI automation kits that help creators automate their workflows, featuring a modern landing page and browsable kit catalog
2. **Artist Portal & POD Network**: An artist-powered print-on-demand (POD) marketplace where artists upload artwork that gets automatically transformed into POD products via Printify integration

The platform combines creator automation tools with a zero-inventory POD model, supporting automated fulfillment and tiered royalty payouts for artists.

## User Preferences
I want the agent to adopt an iterative development approach, focusing on delivering functional components incrementally. When making significant changes or architectural decisions, please ask for my approval first. I prefer clear, concise explanations and expect the agent to maintain a high standard of code quality, adhering to the established tech stack and design patterns.

## System Architecture
The platform is built with a clear separation between frontend and backend.
**UI/UX:** The frontend utilizes React with TypeScript, Wouter for routing, TanStack Query for data fetching, React Hook Form for forms, and Tailwind CSS with Shadcn UI components for styling, ensuring a responsive and modern user experience.
**Technical Implementations:**
- **Public Landing Page** (`/`): Hero section featuring "Automate. Create. Grow. with 247 CreatorStack" with links to kit marketplace and artist login
- **Kits Marketplace** (`/dashboard`): Public catalog displaying AI automation kits with name, pricing, and descriptions (prompt templates)
- **Kits System**: Database-backed kit management with RESTful API (`GET /api/kits`) for browsing available automation tools
- **Artist Workflow:** Artists register, await admin approval, then log in to upload artwork and track its status
- **Admin Workflow:** Admins manage artist accounts, approve/reject artists, and review/approve artwork submissions, which triggers Shopify product creation
- **Printify Integration:** Approved artwork automatically creates Printify POD products
- **Shopify Integration:** Shopify webhooks capture orders, and the platform integrates with the Shopify Admin API for storefront products
- **Royalty System:** A tiered royalty system (30% to 45% based on monthly sales) is implemented, alongside a referral bonus (+5% for UTM-tracked sales) and a recruitment bonus (5% of recruited artist's royalties)
- **Security:** 
  - Session-based authentication with HTTP-only cookies, session regeneration, CSRF protection, bcrypt password hashing, and role-based access control
  - **Separated Login Architecture:** 
    - Admin login at `/admin` (not publicly linked) prevents password reset spam
    - Artist login at `/login` (public, includes registration link)
    - Separate password reset pages: `/forgot-password` (artist) and `/admin/forgot-password` (admin)
    - No cross-exposure between admin and artist authentication flows
  - **Password Reset System (Phase 1 - Completed):** Secure self-service password reset with cryptographically secure tokens (64-byte random), SHA-256 hashing, 60-minute expiration, single-use enforcement, and rate limiting (5 requests per 15 minutes)
  - Rate limiting on critical endpoints: login (10/15min), password reset (5/15min)
  - Audit logging for security events (anonymized, no sensitive data exposure)
- **Database:** Replit's built-in PostgreSQL database (Neon-powered) for persistent storage with Drizzle ORM for database interactions. Features include auto-scaling, connection pooling, and 10 GiB storage capacity. In-memory storage serves as a fallback when database is not configured.
  - **Tables**: artists, admins, artworks, orders, sales, payouts, password_reset_tokens, artist_referrals, referral_clicks, **kits** (newly added)
  - **Kits Table**: Stores AI automation kits with id, name, price (decimal), prompt_template, created_at
- **File Uploads:** Multer handles image uploads, stored locally.
- **API Endpoints:** A comprehensive set of RESTful API endpoints manage authentication, artist management, artwork management, kits marketplace, and admin analytics.

## External Dependencies
- **Replit PostgreSQL Database:** Serverless PostgreSQL (Neon-powered) for persistent storage with auto-scaling and connection pooling
- **Printify API:** For creating POD products and managing fulfillment
- **Shopify Admin API:** For storefront product management and order capture via webhooks
- **Stripe Connect:** Planned for automated artist payouts
- **xAI/Grok API:** Powers AI automation prompt generation with grok-2-1212 (131k context) model
- **Node.js:** Runtime environment

## Development Environment
- **Package Manager:** CRITICAL - Replit Nix environment uses `pnpm`, not `npm`. Always use `pnpm install` for package installation to ensure devDependencies install correctly
- **Environment Variables:** NODE_ENV=development required for devDependencies in Replit Nix
- **Build System:** Vite for frontend bundling with Express backend serving on port 5000