# 247 Print Network - Platform Links & Access

## Main Application

**Replit App (Development):**
- Main URL: `https://workspace.texasmediamaste.repl.co`
- Note: Replace with your actual Replit deployment URL

## Artist Portal

**Artist Login:**
- URL: `https://workspace.texasmediamaste.repl.co/artist/login`
- Test Account: `artist@example.com` / `artist123`

**Artist Dashboard:**
- URL: `https://workspace.texasmediamaste.repl.co/artist/dashboard`
- Features: Upload artwork, view earnings, manage products

**AI Art Studio:**
- URL: `https://workspace.texasmediamaste.repl.co/artist/ai-studio`
- Features: Generate artwork with DALL-E 3, manage AI credits

**Artist Registration:**
- URL: `https://workspace.texasmediamaste.repl.co/artist/register`

**Password Reset:**
- URL: `https://workspace.texasmediamaste.repl.co/artist/reset-password`

## Admin Portal

**Admin Login:**
- URL: `https://workspace.texasmediamaste.repl.co/admin/login`
- Test Account: `admin@247pn.com` / `admin123`

**Admin Dashboard:**
- URL: `https://workspace.texasmediamaste.repl.co/admin/dashboard`

**Admin Pages:**
- Artists Management: `https://workspace.texasmediamaste.repl.co/admin/artists`
- Artworks Management: `https://workspace.texasmediamaste.repl.co/admin/artworks`
- Archived Artworks: `https://workspace.texasmediamaste.repl.co/admin/archived`
- Influencer Management: `https://workspace.texasmediamaste.repl.co/admin/influencers`
- Challenges Management: `https://workspace.texasmediamaste.repl.co/admin/challenges`
- Payouts Management: `https://workspace.texasmediamaste.repl.co/admin/payouts`
- Testimonials Management: `https://workspace.texasmediamaste.repl.co/admin/testimonials`

## Influencer Portal

**Influencer Login:**
- URL: `https://workspace.texasmediamaste.repl.co/influencer/login`

**Influencer Dashboard:**
- URL: `https://workspace.texasmediamaste.repl.co/influencer/dashboard`
- Features: Performance metrics, tier progress, affiliate links

**Influencer Application:**
- URL: `https://workspace.texasmediamaste.repl.co/influencer/apply`
- Public registration for new influencers

**Pending Status:**
- URL: `https://workspace.texasmediamaste.repl.co/influencer/pending`
- Shows while waiting for admin approval

## Public Pages

**Homepage:**
- URL: `https://workspace.texasmediamaste.repl.co/`

**Public Leaderboard:**
- URL: `https://workspace.texasmediamaste.repl.co/leaderboard`
- Features: Top influencers, activity feed, rankings

## Shopify Storefront

**Store URL:**
- Development Store: `https://bvhpq0-hy.myshopify.com`

**Shopify Admin:**
- Admin Dashboard: `https://bvhpq0-hy.myshopify.com/admin`
- Login required to access

**Theme Management:**
- Themes Page: `https://bvhpq0-hy.myshopify.com/admin/themes`
- Development Theme Editor: `https://bvhpq0-hy.myshopify.com/admin/themes/179808633129`
- Development Theme Preview: `https://bvhpq0-hy.myshopify.com?preview_theme_id=179808633129`

**Products:**
- Products Page: `https://bvhpq0-hy.myshopify.com/admin/products`

## API Endpoints (Backend)

**Authentication:**
- `POST /api/artist/register` - Artist registration
- `POST /api/artist/login` - Artist login
- `POST /api/admin/login` - Admin login
- `POST /api/influencer/login` - Influencer login
- `POST /api/logout` - Logout (all user types)

**Artist APIs:**
- `GET /api/artworks/my` - Get my artworks
- `POST /api/artworks` - Upload artwork
- `PATCH /api/artworks/:id` - Update artwork
- `DELETE /api/artworks/:id` - Delete artwork
- `GET /api/artist/dashboard` - Dashboard data

**Admin APIs:**
- `GET /api/admin/artists` - List all artists
- `PATCH /api/admin/artists/:id/approve` - Approve artist
- `GET /api/admin/artworks` - List all artworks
- `PATCH /api/admin/artworks/:id/approve` - Approve artwork
- `POST /api/archive/check` - Run archive check
- `GET /api/artworks/archived` - Get archived artworks

**Influencer APIs:**
- `POST /api/influencer/apply` - Submit application
- `GET /api/influencer/dashboard` - Dashboard metrics
- `GET /api/leaderboard` - Public leaderboard data
- `GET /api/activity-feed` - Activity feed events

**AI Generation APIs:**
- `GET /api/ai/credits` - Get AI credit balance
- `POST /api/ai/generate` - Generate AI artwork
- `GET /api/ai/generations` - Generation history

## Development Tools

**Database Management:**
- Run migrations: `npm run db:push`
- Force migration: `npm run db:push --force`

**Shopify Deployment:**
- Deploy theme: `npm run shopify:deploy`
- Assign templates: `npm run shopify:assign-templates`

**Development Server:**
- Start app: `npm run dev`
- Backend: Express on port 5000
- Frontend: Vite dev server

## Test Accounts

**Artist (Dev/Test Only):**
- Email: `artist@example.com`
- Password: `artist123`
- Status: Approved, 10 free AI credits

**Admin:**
- Email: `admin@247pn.com`
- Password: `admin123`

## Quick Access Checklist

When starting work, bookmark these:
- [ ] Replit App URL (main development)
- [ ] Artist Dashboard (test artist account)
- [ ] Admin Dashboard (platform management)
- [ ] Shopify Admin (storefront management)
- [ ] Shopify Theme Editor (design customization)

## Notes

- All `<your-replit-url>` placeholders should be replaced with your actual Replit deployment URL
- Shopify links require admin authentication to access
- Test accounts are for development/testing only
- Development theme ID: #179808633129
- Store URL: bvhpq0-hy.myshopify.com
