# 247 Print Network - Artist Portal & POD Marketplace

## Overview
The 247 Print Network is an artist-powered print-on-demand (POD) marketplace. Its core purpose is to enable artists to upload their artwork, which, upon administrative approval, is automatically transformed into POD products via Printify integration. The platform handles automated fulfillment and a tiered royalty payout system. The vision is to build a creator-powered marketplace where artists drive product creation, marketing through referrals, and recruitment, all supported by automated royalties and a zero-inventory POD model.

## User Preferences
I want the agent to adopt an iterative development approach, focusing on delivering functional components incrementally. When making significant changes or architectural decisions, please ask for my approval first. I prefer clear, concise explanations and expect the agent to maintain a high standard of code quality, adhering to the established tech stack and design patterns.

## System Architecture
The platform is built with a clear separation between frontend and backend.
**UI/UX:** The frontend utilizes React with TypeScript, Wouter for routing, TanStack Query for data fetching, React Hook Form for forms, and Tailwind CSS with Shadcn UI components for styling, ensuring a responsive and modern user experience.
**Technical Implementations:**
- **Artist Workflow:** Artists register, await admin approval, then log in to upload artwork and track its status.
- **Admin Workflow:** Admins manage artist accounts, approve/reject artists, and review/approve artwork submissions, which triggers Shopify product creation.
- **Printify Integration:** Approved artwork automatically creates Printify POD products.
- **Shopify Integration:** Shopify webhooks capture orders, and the platform integrates with the Shopify Admin API for storefront products.
- **Royalty System:** A tiered royalty system (30% to 45% based on monthly sales) is implemented, alongside a referral bonus (+5% for UTM-tracked sales) and a recruitment bonus (5% of recruited artist's royalties).
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
- **File Uploads:** Multer handles image uploads, stored locally.
- **API Endpoints:** A comprehensive set of RESTful API endpoints manage authentication, artist management, artwork management, and admin analytics.

## External Dependencies
- **Replit PostgreSQL Database:** Serverless PostgreSQL (Neon-powered) for persistent storage with auto-scaling and connection pooling
- **Printify API:** For creating POD products and managing fulfillment
- **Shopify Admin API:** For storefront product management and order capture via webhooks
- **Stripe Connect:** Planned for automated artist payouts
- **Node.js:** Runtime environment