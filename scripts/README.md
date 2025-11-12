# 247 Print Network - Deployment Scripts

This directory contains automation scripts for Shopify theme deployment and management.

## Available Scripts

### 1. `deploy-shopify-theme.js`
**Purpose:** Automatically upload all custom theme files to Shopify

**Usage:**
```bash
npm run shopify:deploy
```

**What it does:**
- Verifies all 5 theme files exist
- Checks Shopify authentication
- Uploads files using Shopify CLI
- Shows progress and confirmation

**Requirements:**
- Shopify CLI authenticated (`npm run shopify:auth`)

---

### 2. `assign-art-template.js`
**Purpose:** Automatically assign the "art" product template to all art products

**Usage:**
```bash
npm run shopify:assign-templates
```

**What it does:**
- Connects to Shopify Admin API
- Finds all art products (by vendor/tags)
- Assigns "art" template to each
- Shows progress and summary

**Requirements:**
- `SHOPIFY_ADMIN_API_TOKEN` in `.env`
- `SHOPIFY_STORE_URL` in `.env`

---

### 3. `populate-homepage-products.js`
**Purpose:** Update homepage with real products instead of placeholder images

**Usage:**
```bash
npm run shopify:populate-homepage
```

**What it does:**
- Fetches 8 featured products from your Shopify store
- Gets collection cover images from each finish type (Metal, Canvas, Paper, Framed)
- Updates homepage configuration with real product URLs and images
- Deploys directly to live Shopify theme

**Requirements:**
- `SHOPIFY_STORE_URL` in `.env`
- `SHOPIFY_ACCESS_TOKEN` in `.env`

**When to use:**
- After adding new products to showcase on homepage
- When updating featured collections
- To refresh homepage with latest inventory

---

## Quick Start

1. **First time setup:**
   ```bash
   npm run shopify:auth
   ```

2. **Deploy theme files:**
   ```bash
   npm run shopify:deploy
   ```

3. **Auto-assign templates (optional):**
   ```bash
   # Set up .env first with API credentials
   npm run shopify:assign-templates
   ```

## Documentation

See `SHOPIFY_DEPLOYMENT_GUIDE.md` for complete setup instructions and troubleshooting.

## Files Deployed

```
attached_assets/theme/
├── sections/247-art-product.liquid
├── snippets/247-art-options.liquid
├── snippets/247-art-lineitem-properties.liquid
├── snippets/247-merch-upsell.liquid
└── assets/247-art.js
```

## Environment Variables

### For Template Assignment (Optional)

```bash
SHOPIFY_ADMIN_API_TOKEN=shpat_xxxxx...
SHOPIFY_STORE_URL=your-store.myshopify.com
```

Create these in Shopify Admin → Settings → Apps and sales channels → Develop apps

---

**Need help?** See `SHOPIFY_DEPLOYMENT_GUIDE.md` for detailed instructions.
