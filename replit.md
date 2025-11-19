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
- **Coming Soon Landing Pages:** 
  - **Replit App Version:** Available at `/coming-soon` route. Password-protected pre-launch page for closed beta testing (passwords: "247tester", "printtester"). Session-based unlock with HTTP-only cookies.
  - **Shopify Version:** Standalone HTML template (`shopify-coming-soon.html`) for 247printnetwork.com. Works with Shopify's built-in password protection. Both versions feature hero section with bold messaging ("Where Artists Build Profitable Empires"), dual value propositions targeting art lovers and artists, side hustle messaging (30-45% royalties, zero costs), platform highlights, and email waitlist signup connecting to Replit backend API. Waitlist includes duplicate prevention and admin email notifications via Resend.
- **Shopify Storefront:** Custom `247-art.css` with a Displate-inspired aesthetic, featuring artist spotlights, interactive product selectors, and mobile responsiveness. Artist Portal navigation now fully integrated across site: desktop header CTAs ("Artist Portal" login + coral "Become an Artist" button), mobile drawer (priority gradient CTA + login link with 48px touch targets), and footer "For Artists" section (signup, login, benefits, FAQs) - all pointing to 247portal.replit.app. Product page layout uses responsive 3-column grid: Column 1 (thumbnails, 120px fixed), Column 2 (mockup preview, 750-850px responsive via minmax), Column 3 (configuration, 300-340px responsive via minmax). Total layout width: 1374px, optimized for 1440px+ screens with 18px safety buffer to prevent horizontal scroll while maintaining 1366px baseline compatibility.
- **Influencer Affiliate Program:** Public application, tiered commissions (20-40%), global `?ref=` tracking with 30-day cookie attribution, and an influencer dashboard with gamification.
- **Customer-Facing Pages:** Displate-inspired About Us, Meet the Creators, Artist Profile Pages, Contact Us, FAQs, and optimized product pages.

**Technical Implementations:**
- **Backend Framework:** Node.js.
- **Database:** PostgreSQL (Neon-powered) with Drizzle ORM.
- **Authentication:** Session-based with HTTP-only cookies, bcrypt hashing, and CSRF protection.
- **Object Storage:** Replit Object Storage for persistent image storage across deployments. Replaces ephemeral filesystem storage (`/uploads/`) with durable object storage (`/objects/`). Includes ObjectStorageService with buffer-based read/write operations, security path validation, and automatic caching. Vision Preview Helper supports both legacy filesystem and new object storage URLs during migration. Migration script transfers existing filesystem images to object storage and updates database records. See OBJECT_STORAGE_SETUP.md for configuration details.
- **AI Generation System:** Integration with OpenAI DALL-E 3 (for Print Network) and GPT-4o Vision (for CreatorStack) via Replit AI Integrations, featuring a dual-balance credit system and token usage tracking. Vision Preview Helper automatically generates downsized JPEG previews (~2048px, <20MB) for large high-resolution images before sending to OpenAI Vision API, with object-storage-based caching to optimize performance. Structured error handling system (AI_IMAGE_TOO_LARGE, AI_IMAGE_FETCH_FAILED, etc.) provides user-friendly error messages instead of technical API failures.
- **Shopify Integration:** Automated product creation, order capture via HMAC-verified webhooks, and automated theme/navigation deployment. Product structure supports 36 variants per artwork (6 sizes × 6 finishes including Paper, Canvas, Metal, Framed-Black, Framed-White, Framed-Walnut), with smart collections for organization. Frame color selector only enabled for Paper prints (Canvas/Metal cannot be framed per Printify limitations). Interactive product configurator features visual size scaling, realistic frame previews, and intelligent variant mapping (Paper + Frame selection → Framed-[Color] variant).
  - **Theme Deployment:** Three deployment methods available: (1) **Shopify CLI** - One-command deployment via `shopify theme push` from `attached_assets/theme/` directory, replacing manual 11-file uploads with automated 30-second deployment. Includes dedicated deploy script (`scripts/shopify-deploy.sh`) with safe test theme creation option. (2) **GitHub Auto-Sync** - Native Shopify-GitHub integration enabling automatic theme updates on every git push, with full version control and easy rollback capabilities. (3) **Manual Upload** - Traditional file-by-file upload via Shopify Admin (legacy method, now deprecated in favor of CLI/GitHub workflows). All theme files organized in proper Shopify structure with `.shopifyignore` configured to exclude documentation and preserve store-specific settings. See `SHOPIFY_CLI_DEPLOY.md` and `GITHUB_INTEGRATION.md` for detailed setup instructions.
- **Printify Integration:** Automated Print-on-Demand product creation aligned with 4 wall art types, with automated mockup image sync to Shopify product galleries.
- **Stripe Connect:** For automated artist royalty payouts and subscription management.
- **Email Notifications:** Resend integration for transactional emails with professional templates and delivery logging, including a strategic trial email funnel with 4 templates.
- **Artwork Management:** Automated archiving and smart tagging.
- **Royalty System:** Dual-tier structure combining performance (30-45%) and subscription tiers, with referral and recruitment bonuses.
- **Artist Subscription Tiers:** Three tiers (Free, Pro, Elite) with recurring billing via Stripe, including a comprehensive free trial system with lifecycle management.
- **Featured Artist System:** Hybrid performance and fair rotation logic for homepage placement.
- **Security:** HMAC verification, rate limiting, audit logging, soft-delete, and production-hardened authentication.
- **AI Image Upscaling System:** Integrated Real-ESRGAN via Replicate API to reduce registration friction while maintaining print quality standards. Features include DPI-driven validation, inline upscale widget, tiered quota system, deduplication cache, and 8-layer abuse protection. Intelligent upscaling with increased pixel limit (8M pixels, ~2828×2828px), automatic scale factor calculation to unlock all 12 product variants, and GPU memory fallback that automatically retries with smaller scale if Replicate GPU fails. User-friendly error handling system with structured error codes (IMAGE_TOO_LARGE, GPU_MEMORY_LIMIT, etc.), and automatic translation of technical API errors into clear, actionable messages for artists.
- **Printify Mockup Sync System:** Automated system that retrieves Printify-generated product mockup images and adds them to Shopify product galleries after artwork approval. Features intelligent retry logic with exponential backoff (5s, 10s, 15s delays), non-blocking async execution, and comprehensive error handling. System runs automatically during artwork approval workflow without delaying admin response.
- **Admin Tools Panel:** Centralized admin interface at `/admin/tools` for artist management with comprehensive audit logging. Features include: (1) AI Upscale Credit Reset - manually reset artist's monthly upscale quota when needed, (2) Comp Subscription Tiers - grant Pro/Elite tiers without Stripe payment for VIP artists, partnerships, or bug compensation. All actions logged in adminActions table with actor, target, action metadata, and optional notes for compliance and transparency.
- **Production Readiness:** Health check endpoint (`/api/health`) for 6 key integrations, and a detailed deployment runbook.
- **Mobile Accessibility:** WCAG 2.1 Level AAA compliance with 44px minimum touch targets.

## External Dependencies
- **Replit PostgreSQL Database:** Serverless PostgreSQL (Neon-powered).
- **Replit Object Storage:** Persistent image storage (buckets: ARTWORK_UPLOADS_DIR, AI_GENERATED_DIR, AI_PREVIEWS_DIR).
- **OpenAI API:** DALL-E 3 and GPT-4o (via Replit AI Integrations).
- **Replicate API:** Real-ESRGAN for AI-powered image upscaling.
- **Printify API:** For Print-on-Demand fulfillment.
- **Shopify Admin API:** For storefront management.
- **Stripe Connect:** For payments and subscriptions.
- **Resend:** For transactional email services.
- **Node.js:** Backend runtime.