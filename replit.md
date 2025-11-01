# Artist Portal

A private artist portal where approved artists can log in, upload artwork, view their submissions, and track status. Admins can review uploads, approve or reject them, and automatically push approved art into Shopify as draft products.

## Features

### MVP Features (Completed)
- ✅ Artist registration and login system with approval workflow
- ✅ Admin dashboard to approve/reject artist accounts
- ✅ Artwork upload form with title, description, tags, and image file (using Multer)
- ✅ Artist dashboard showing all their submissions with status (pending, approved, rejected)
- ✅ Admin review queue to view all pending artwork submissions
- ✅ Approve artwork button that creates draft product in Shopify via Admin API
- ✅ Reject artwork button with basic status update
- ✅ Supabase integration for storing artist profiles, artwork metadata, and submission status
- ✅ Clean, professional UI with separate artist and admin views
- ✅ Image file storage and display for uploaded artwork

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
- Shopify Admin API for product creation
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

**Optional secrets:**
- `SHOPIFY_SHOP_URL`: Your Shopify store URL
- `SHOPIFY_ACCESS_TOKEN`: Shopify Admin API access token

**Note:** The app uses Supabase for persistent storage. If Supabase credentials are not configured, it falls back to in-memory storage (data lost on restart).

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
