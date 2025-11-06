# 247 Print Network - Artist Portal & POD Marketplace

An artist-powered print-on-demand marketplace where artists upload artwork, admins approve submissions, and approved art automatically becomes POD products through Printify integration with automated fulfillment and tiered royalty payouts.

## Vision

Building a **creator-powered marketplace empire** where:
- Artists become your product team (they upload the art)
- Artists become your marketing team (referral bonuses for driving traffic)
- Artists recruit more artists (network effect with recruitment bonuses)
- Automated royalties incentivize performance (30% → 45% tiers based on sales)
- Zero inventory - all print-on-demand through Printify
- Automated fulfillment and payouts - hands-off operation at scale

## Features

### Phase 1: Foundation (COMPLETE ✅)
- ✅ Artist registration and login system with approval workflow
- ✅ Admin dashboard to approve/reject artist accounts
- ✅ Artwork upload form with title, description, tags, and image file (using Multer)
- ✅ Artist dashboard showing all their submissions with status (pending, approved, rejected)
- ✅ Admin review queue to view all pending artwork submissions
- ✅ Database schema for orders, sales, royalties, referrals, and payouts
- ✅ **Printify API integration** - Complete
- ✅ Approve artwork → creates Printify POD products automatically
- ✅ Shopify order webhook endpoint - captures customer orders
- ✅ Order tracking system with tiered royalty calculation (30%-45%)
- ✅ Sale tracking with artist earnings
- ✅ **Artist Earnings Dashboard** - Complete with tier badges, progress bars, sales history
- 🚧 Printify fulfillment automation (deferred to post-MVP)

### Phase 2: Revenue & Automation (Planned)
- ✅ Shopify order webhooks capture sales
- ✅ Tiered royalty system (30% → 35% → 40% → 45% based on monthly sales)
- ⏳ UTM tracking for artist referral links (+5% bonus)
- ⏳ Artist recruitment tracking (5% of recruited artist's royalties)
- ⏳ Stripe Connect integration for automated payouts

### Phase 3: Growth & Empire Mode (Planned)
- ⏳ Public artist profile pages (`/creators/[artist-name]`) for SEO
- ⏳ Artist referral link generator
- ⏳ Tiered memberships (Free/Pro/Premium for artists)
- ⏳ Digital downloads (wallpapers, brushes)
- ⏳ Limited edition prints
- ⏳ Admin empire dashboard (revenue, artist performance, referral networks)

## Tech Stack

### Frontend
- React with TypeScript
- Wouter for routing
- TanStack Query for data fetching
- React Hook Form for form management
- Tailwind CSS for styling
- Shadcn UI components

### Backend
- Express.js with TypeScript
- Multer for file uploads
- Supabase for database (PostgreSQL)
- **Printify API** for POD products and fulfillment
- Shopify Admin API for storefront products
- Stripe Connect for automated artist payouts
- Bcrypt for password hashing

## Getting Started

### Prerequisites
- Node.js 20+
- Supabase account (for database)
- Shopify store with Admin API access

### Environment Variables
**Required secrets:**
- `SESSION_SECRET`: Session secret (configured)
- `ADMIN_BOOTSTRAP_SECRET`: Secret for creating first admin account (configured)
- `SUPABASE_URL`: Your Supabase project URL (configured)
- `SUPABASE_KEY`: Your Supabase anon/public API key (configured)

**Required for full functionality:**
- `SHOPIFY_SHOP_URL`: Your Shopify store URL (configured)
- `SHOPIFY_ACCESS_TOKEN`: Shopify Admin API access token (configured)
- `PRINTIFY_API_TOKEN`: Printify API token for POD integration (configured)

**Coming soon:**
- `STRIPE_SECRET_KEY`: Stripe API key for payments
- `STRIPE_CONNECT_CLIENT_ID`: Stripe Connect for artist payouts

**Note:** The app uses Supabase for persistent storage. Database tables are automatically created via Drizzle schema push.

### Database Setup
If using Supabase, create the following tables:

**artists table:**
```sql
CREATE TABLE artists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  approved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**admins table:**
```sql
CREATE TABLE admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**artworks table:**
```sql
CREATE TABLE artworks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES artists(id),
  title TEXT NOT NULL,
  description TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  image_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  shopify_product_id TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### Initial Admin Setup

**Automatic Bootstrap:** The application automatically creates a default admin account on startup if one doesn't exist.

Default admin credentials:
- Email: admin@example.com
- Password: admin123

**Important:** Change these credentials after first login!

**Manual Admin Creation:**
If you need to manually create an admin account, the `/api/admins/create` endpoint is protected by the `ADMIN_BOOTSTRAP_SECRET` environment variable. Run:
```bash
npx tsx server/seed-admin.ts
```

**Security Features:**
- Admin creation requires `ADMIN_BOOTSTRAP_SECRET` header
- Session-based authentication with HTTP-only cookies
- Session regeneration on login prevents session fixation
- CSRF protection with SameSite cookies
- Password hashing with bcrypt (10 rounds)
- Role-based access control (artist/admin)

## User Workflows

### Artist Workflow
1. Register for an account at `/register`
2. Wait for admin approval
3. Log in at `/login` (select Artist tab)
4. Upload artwork from dashboard
5. Track submission status (pending/approved/rejected)

### Admin Workflow
1. Log in at `/login` (select Admin tab)
2. Manage artist accounts at `/admin/artists`
3. Approve or reject pending artists
4. Review artwork submissions at `/admin/dashboard`
5. Approve (creates Shopify draft product) or reject with reason

## Project Structure

```
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # UI components
│   │   ├── pages/         # Page components
│   │   ├── lib/           # Utilities (auth, query client)
│   │   └── hooks/         # React hooks
├── server/                # Express backend
│   ├── lib/              # Utilities (Supabase, Shopify)
│   ├── routes.ts         # API routes
│   └── storage.ts        # Data access layer
├── shared/               # Shared types and schemas
│   └── schema.ts        # Database schemas
└── uploads/             # Uploaded images
```

## API Endpoints

### Authentication
- `POST /api/artists/register` - Register new artist
- `POST /api/artists/login` - Artist login
- `POST /api/admins/login` - Admin login
- `POST /api/admins/create` - Create admin (for setup)

### Artist Management
- `GET /api/artists` - Get all artists (admin)
- `POST /api/artists/:id/approve` - Approve artist (admin)
- `GET /api/artists/:id/earnings` - Get artist earnings stats (artist)

### Artwork Management
- `POST /api/upload` - Upload image file
- `POST /api/artworks` - Create artwork submission
- `GET /api/artworks/my-artworks?artistId={id}` - Get artist's artworks
- `GET /api/artworks/all` - Get all artworks (admin)
- `PATCH /api/artworks/:id` - Update artwork
- `POST /api/artworks/:id/approve` - Approve and create Shopify product
- `POST /api/artworks/:id/reject` - Reject with reason

## Notes

- The application uses in-memory storage as fallback if Supabase is not configured
- Shopify integration is optional - artworks can still be approved without it
- File uploads are stored in the `/uploads` directory
- Images are served statically from `/uploads/:filename`

## Recent Changes

### November 6, 2025 - Artist Earnings Dashboard Complete ✅
- ✅ **Complete earnings dashboard** at `/artist/earnings` showing all artist revenue metrics
- ✅ **API endpoint** `GET /api/artists/:id/earnings` returns totals, monthly sales, tier, and sales history
- ✅ **Beautiful UI with:**
  - Tier badges (Bronze 30%, Silver 35%, Gold 40%, Platinum 45%)
  - 4 stats cards: Total Earnings, Monthly Sales, Current Tier, Sales Count
  - Progress bar showing dollar amount to next tier
  - Sales history table with artwork titles, dates, amounts, tiers, and earnings
- ✅ **Navigation:** "View Earnings" button added to artist dashboard
- ✅ **Security:** Session-based auth ensures artists can only view their own earnings
- ✅ **getSalesByArtist** storage method implemented in both Drizzle and in-memory storage
- ✅ **End-to-end tested:** All UI components render correctly, navigation works
- ✅ **Architect approved:** Production-ready implementation
- 📝 **Critical fix:** Corrected React Query key pattern to use full endpoint path

### November 6, 2025 - Complete Drizzle ORM Migration (CRITICAL FIX)
- ✅ **Fixed Supabase PostgREST schema cache bug** - Migrated ALL storage methods from Supabase JS client to Drizzle ORM
- ✅ **Migrated artist methods:** getArtist, createArtist, getArtistByEmail, getAllArtists, updateArtist
- ✅ **Migrated artwork methods:** createArtwork, getArtwork, getArtworksByArtist, getAllArtworks, updateArtwork
- ✅ **Migrated order/sale methods:** createOrder, updateOrder, createSale
- ✅ **End-to-end tested:** Complete MVP workflow (registration → artwork upload → approval → Shopify integration)
- ✅ **Resilient approval:** Artwork approval continues even if Printify/Shopify APIs fail
- ✅ **Root cause:** Supabase PostgREST caches schema and doesn't recognize new columns even after schema push
- ✅ **Solution:** Direct Drizzle ORM queries bypass PostgREST cache, use @neondatabase/serverless driver
- ✅ **Architect approved:** Production-ready with PASS verdict

### November 6, 2025 - Order Capture & Royalty System Complete ✅
- ✅ **Shopify webhook endpoint** with HMAC security verification (timing-safe comparison)
- ✅ **Order processor** extracts artist/artwork from SKU, creates order records using Drizzle ORM
- ✅ **Tiered royalty calculator** (30% → 35% → 40% → 45% based on monthly sales AMOUNT)
  - $0-$999/month: 30% royalty
  - $1000-$4999/month: 35% royalty
  - $5000-$9999/month: 40% royalty
  - $10,000+/month: 45% royalty
- ✅ **Sale tracking** with artist earnings breakdown (base_royalty, referral_bonus, recruitment_bonus, total_earnings)
- ✅ **monthlySales column** added to artists table for tier calculation
- ✅ **End-to-end tested**: Webhook → Order → Sale → Tier calculation all working
- ✅ **Architect-approved** PASS - production-ready implementation
- 📝 **MVP Status**: Core revenue workflow complete (upload → approve → create products → capture orders → calculate royalties)
- 📝 **Deferred to post-launch**: Auto-sync monthlySales, Printify fulfillment automation, UTM tracking, recruitment bonuses, Stripe Connect, artist dashboards

### November 1, 2025 - Registration Flow Fix
- ✅ Fixed artist registration to automatically log in users
- ✅ Registration now creates backend session and redirects to /artist/pending
- ✅ Improved case conversion helpers to handle nested objects recursively
- ✅ Fixed MemStorage type compatibility issue

### November 1, 2025 - Supabase Integration
- ✅ Connected to Supabase for persistent database storage
- ✅ Created database tables (artists, admins, artworks)
- ✅ Configured automatic admin account bootstrap in Supabase
- ✅ All data now persists across server restarts
- ✅ Fallback to in-memory storage if Supabase not configured

### October 31, 2025 - Security & Core Features

### Security Hardening
- ✅ Implemented session-based authentication with express-session
- ✅ Added authentication middleware (requireAuth, requireArtist, requireAdmin)
- ✅ Protected all API endpoints with proper authorization checks
- ✅ Session cookies configured with sameSite: 'lax' and secure flag
- ✅ Session regeneration on login to prevent session fixation attacks
- ✅ Admin creation endpoint secured with ADMIN_BOOTSTRAP_SECRET
- ✅ Removed client-supplied user IDs - all authorization server-side
- ✅ Password hashing with bcrypt

### Features
- ✅ Complete artist portal implementation
- ✅ Supabase integration for data persistence (optional)
- ✅ Shopify integration for approved artwork (optional)
- ✅ Beautiful, responsive UI following design guidelines
- ✅ Authentication with protected routes
- ✅ Admin approval workflow for both artists and artwork
- ✅ In-memory storage as default (no database setup required)
