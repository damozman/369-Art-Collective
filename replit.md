# 247 Print Network - Artist Portal & POD Marketplace

## Overview
The 247 Print Network is an artist-powered print-on-demand (POD) marketplace. Its core purpose is to enable artists to upload their artwork, which, upon administrative approval, is automatically transformed into POD products via Printify integration. The platform handles automated fulfillment and a tiered royalty payout system. The vision is to build a creator-powered marketplace where artists drive product creation, marketing through referrals, and recruitment, all supported by automated royalties and a zero-inventory POD model.

## Recent Changes (November 2025)
**Portfolio Submission System (November 2025)**
- **Implementation**: Two-phase registration wizard requiring artists to submit 2-3 portfolio samples during signup to create exclusivity and filter non-serious artists
  - Added `portfolio_submissions` table with (id, artistId, imageUrl, createdAt) schema
  - Created POST `/api/artists/portfolio` endpoint for authenticated portfolio uploads (allows unapproved artists)
  - Created GET `/api/artists/:id/portfolio` admin endpoint to view submissions during approval
  - Storage layer methods added to both PostgresStorage and MemStorage for portfolio CRUD operations
- **Registration Flow**:
  - **Step 1**: Account creation (email, name, artistShort, password) → auto-login → advance to Step 2
  - **Step 2**: Portfolio upload with 2-3 high-quality images (minimum 2400×3000px) → redirect to pending approval
  - Progress indicator shows current step (1: Account Details, 2: Portfolio Samples)
  - File preview grid with remove functionality using refs for proper state management
  - Clear requirements displayed: min resolution, DPI recommendation, supported formats, file size limit
- **Image Quality Validation**:
  - Same validation as artwork uploads: 2400×3000px minimum (or 3000×2400 landscape)
  - Custom dimension reader (server/lib/image-validator.ts) parses PNG/JPEG headers without external dependencies
  - Automatic file cleanup for rejected uploads prevents orphaned files
  - Only PNG and JPG formats accepted (GIF excluded due to 256-color limitation)
- **Admin Portfolio Viewing**:
  - Artist detail page displays "Portfolio Submissions" card before approval review
  - Grid layout showing portfolio images with "Sample N" labels
  - Empty state handling for artists registered before portfolio requirements
  - Images normalized to absolute URLs for cross-domain support
- **User Experience**:
  - Blue info box lists requirements before file selection
  - Live image previews with remove buttons
  - Helpful error messages show actual vs required dimensions when validation fails
  - Submit button disabled until 2 images uploaded, enabled when 2-3 present
- **Technical Details**:
  - Server validates after file upload, before database entry
  - Failed uploads return detailed error with min/actual dimensions
  - Database stores relative paths (/uploads/portfolio-...), API normalizes to absolute URLs
  - Enforced both client-side (wizard UI) and server-side (endpoint validation)
- **Testing**: End-to-end test verified: registration → portfolio upload → admin viewing flow. Created high-resolution test image generator script (scripts/generate-test-images.js) to produce 2400×3000px PNG files for testing.

**Critical Fix: Artwork Image URL Normalization**
- **Problem**: Artwork images failed to load in artist/admin portals when accessed through custom domains because database stored relative URLs (`/uploads/...`)
- **Solution**: Implemented API-level URL normalization in `server/routes.ts`
  - Added `toAbsoluteUrl()` helper that converts relative URLs to absolute using REPLIT_DOMAINS or request host
  - Added `normalizeArtwork()` wrapper that applies URL conversion to artwork objects
  - Updated all 6 artwork API endpoints to return normalized URLs:
    - POST /api/artworks (create)
    - GET /api/artworks/my-artworks (artist's artworks)
    - GET /api/artworks/all (admin view)
    - PATCH /api/artworks/:id (update)
    - POST /api/artworks/:id/approve
    - POST /api/artworks/:id/reject
  - Includes null guard to prevent runtime errors
- **Impact**: All artwork images now load correctly across all domains. Database continues to store relative paths; normalization happens at API response time.
- **Tested**: End-to-end verification confirmed images render correctly in both artist and admin dashboards with absolute URLs

**Critical Bug Fix: Shopify Image URL Construction**
- **Problem**: Shopify product creation was failing because image URLs were constructed using non-existent environment variables (`REPL_SLUG`, `REPL_OWNER`)
- **Solution**: Updated `server/lib/shopify.ts` to use `REPLIT_DOMAINS` environment variable for production deployment URLs
  - Parses `REPLIT_DOMAINS` and prefers canonical domain (without hash)
  - Falls back to `localhost:5000` for local development
  - Added comprehensive logging to track image URL construction
- **Impact**: Artwork approvals now correctly send hosted image URLs to Shopify (e.g., `https://247portal.replit.app/uploads/...`)

**Account Deletion System (November 2025)**
- **Implementation**: Comprehensive soft-delete system for artist accounts
  - Artist self-deletion with password confirmation requirement
  - Admin-initiated deletion capability for account management
  - Soft delete approach sets `deletedAt` timestamp, preserving all historical data
  - All queries filter `WHERE deletedAt IS NULL` to exclude deleted accounts
  - Deleted artists cannot log in (treated as non-existent in authentication)
  - Session destruction on self-deletion with frontend cache invalidation
- **User Experience**:
  - Artist settings page includes Delete Account card with clear warnings
  - Password confirmation required for artist self-deletion (security measure)
  - Admin artist detail page includes Delete Artist Account card
  - Both flows use confirmation dialogs with explicit consequences
  - Proper success/error feedback via toast notifications
  - Correct redirects: `/login` for artist deletion, `/admin/artists` for admin deletion
- **Data Preservation**:
  - Shopify products remain active and available for purchase after artist deletion
  - Historical data preserved: artworks, sales records, royalty calculations
  - Foreign key relationships remain intact for reporting and analytics
- **Security**: Password verification using bcrypt for artist self-deletion, session cleanup prevents zombie sessions
- **Testing**: End-to-end tests verify both deletion flows, login prevention, and proper UI redirects

**Product Deactivation/Activation Feature (November 2025)**
- **Implementation**: Artists can now control the visibility of their approved products on the Shopify storefront
  - Added `shopifyProductStatus` field to artworks schema (database column: `shopify_product_status`)
  - Created Shopify integration function `updateProductStatus()` using REST Admin API 2024-10
  - Implemented API endpoints:
    - POST `/api/artworks/:id/deactivate` - Sets product to "draft" (hidden from customers)
    - POST `/api/artworks/:id/activate` - Sets product to "active" (visible to customers)
  - Both endpoints require artist authentication and verify artwork ownership
- **User Experience**:
  - Artist dashboard shows "Store Visibility" section for approved products with Shopify integration
  - Status badges: "Active" (blue) for visible products, "Hidden" (secondary) for draft products
  - Action buttons: "Show in Store" and "Hide from Store" with clear labeling
  - Confirmation dialogs prevent accidental changes (AlertDialog component)
  - Real-time UI updates with optimistic cache invalidation
  - Toast notifications for success/error feedback
- **Technical Details**:
  - Shopify API updates product status between "draft" and "active" states
  - Database syncs with Shopify status for offline tracking
  - Default status is "draft" for new products (artists must explicitly activate)
  - Soft delete approach: products remain in Shopify, just hidden from customers
  - Reversible operations: artists can activate/deactivate products anytime
- **Testing**: End-to-end tests verified activation/deactivation flow, confirmation dialogs, and Shopify API integration

**Image Quality Validation (November 2025)**
- **Implementation**: Enforces minimum image resolution requirements to ensure professional print quality
  - Created custom image dimension reader in `server/lib/image-validator.ts`
  - Reads PNG and JPEG headers directly without external dependencies
  - Validates minimum 2400×3000 pixels (Printify's 300 DPI standard for 8"×10" prints)
  - Supports both portrait (2400×3000) and landscape (3000×2400) orientations
  - Automatic file cleanup for rejected uploads (prevents orphaned files)
- **User Experience**:
  - Upload page displays clear requirements before file selection
  - Blue info box lists: minimum resolution, DPI recommendation, supported formats, file size limit
  - Helpful error messages show actual vs required dimensions when validation fails
  - Only PNG and JPG formats accepted (GIF excluded due to 256-color limitation)
- **Technical Details**:
  - Multer fileFilter whitelists only `image/png`, `image/jpeg`, `image/jpg`
  - Custom header parsing for PNG (IHDR chunk) and JPEG (SOF0/SOF2 markers)
  - Server-side validation runs after file upload, before database entry
  - Failed uploads return detailed error with min/actual dimensions
  - 10MB file size limit enforced by Multer
- **Testing**: End-to-end tests verified low-res rejection, high-res acceptance, error messaging, and successful artwork submission

**Development Environment Fixes**
- Moved runtime-required packages from `devDependencies` to `dependencies` for Replit workflow compatibility
- Removed unused `@tailwindcss/typography` plugin that was causing esbuild deadlock errors
- Created dynamic import pattern for Vite to prevent eager loading in production

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