# Shopify Navigation Setup - Automated Script

## Overview
**NEW:** Fully automated script that creates pages and navigation menus for your 369 Art Collective Shopify store using the Shopify Admin API.

**What It Does:**
1. ✅ Creates 5 custom pages with assigned templates (REST API)
2. ✅ Creates main navigation menu with dropdowns (GraphQL API)
3. ✅ Creates footer navigation menu with sections (GraphQL API)
4. ✅ Handles duplicates gracefully (skips existing pages/menus)
5. ✅ Uses functional URLs even when collections don't exist yet

**Time Savings:** Manual setup (~30 minutes) → Automated (~30 seconds)

---

## Quick Start

### Prerequisites

1. **Shopify Admin API Access Token** with scopes:
   - `write_content` (for page creation)
   - `write_online_store_navigation` (for menu creation)

2. **Environment Variables** in Replit Secrets:
   - `SHOPIFY_SHOP_URL` (e.g., `your-store.myshopify.com`)
   - `SHOPIFY_ACCESS_TOKEN` (your Admin API token)

### Run the Script

```bash
node scripts/setup-shopify-navigation.js
```

**That's it!** The script will:
- Create 5 pages with custom templates
- Create main menu with dropdown navigation
- Create footer menu with sections
- Skip any existing resources
- Warn you about missing collections (but still create working links)

---

## What Gets Created

### 📄 Pages (with Custom Templates)

| Page | Handle | Template | Description |
|------|--------|----------|-------------|
| About Us | `about` | `page.about` | Platform mission and how it works |
| Contact Us | `contact` | `page.contact` | Contact form and support info |
| Meet the Creators | `creators` | `page.creators` | Artist directory |
| FAQs | `faq` | `page.faq` | Frequently asked questions |
| Join the Creatorverse | `join` | `page.join` | Artist recruitment |

### 🧭 Main Navigation Menu

```
Main Menu
├── 🏠 Home (/)
├── 📦 Shop
│   ├── By Artist
│   │   ├── Featured Artists
│   │   └── Browse All Artists
│   └── By Style
│       ├── Abstract
│       ├── Pop Culture
│       ├── Nature & Landscapes
│       └── Urban & Street
├── ℹ️ About
│   ├── About Us
│   ├── Meet the Creators
│   ├── Join as an Artist
│   └── FAQs
└── 💬 Support
    ├── Contact Us
    ├── Shipping Policy
    ├── Refund Policy
    └── Privacy Policy
```

### 🦶 Footer Navigation Menu

```
Footer Menu
├── 📖 About
│   ├── About Us
│   ├── Meet the Creators
│   ├── Join as an Artist
│   └── FAQs
├── 💬 Support
│   ├── Contact Us
│   ├── Shipping Policy
│   ├── Refund Policy
│   └── Privacy Policy
└── ⚖️ Legal
    ├── Terms of Service
    └── Privacy Policy
```

---

## Graceful Degradation (Smart Fallbacks)

### Missing Collections/Pages

**The script creates working HTTP links even when resources don't exist yet:**

```
⚠ Collection "abstract-art" not found, using HTTP link
  URL: /collections/abstract-art
```

**How It Works:**
- ✅ Links use functional storefront paths (e.g., `/collections/abstract-art`)
- ✅ Menus work immediately, even if collections aren't created yet
- ✅ When you create the collection later, links work automatically
- ✅ No need to re-run the script

### Existing Pages

**Detects and skips pages that already exist:**

```
⚠ Page "About Us" already exists, skipping
  URL: /pages/about
```

**How It Works:**
- ✅ Treats existing pages as successful skips (not errors)
- ✅ Shows page URL so you know it's available
- ✅ Prevents duplicate page errors

---

## Technical Details

### API Usage

- **REST API:** Page creation (Shopify Admin API 2025-01)
- **GraphQL API:** Menu creation (`menuCreate` mutation)
- **Rate Limiting:** 500ms delay between requests to respect Shopify limits

### Resource Linking

| Resource Type | GraphQL ID | Fallback URL |
|---------------|-----------|--------------|
| Page | `gid://shopify/Page/{ID}` | `/pages/{handle}` |
| Collection | `gid://shopify/Collection/{ID}` | `/collections/{handle}` |
| Policy | N/A (HTTP only) | `/policies/{handle}` |
| Frontpage | N/A (HTTP only) | `/` |

### Security

- ✅ Loads credentials from environment variables (no hardcoded secrets)
- ✅ HTTPS-only API requests
- ✅ HMAC verification for webhooks (in production)

---

## Example Script Output

```
═════════════════════════════════════════════
📋 Shopify Navigation Setup Script
═════════════════════════════════════════════

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Creating Pages
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Creating page: About Us...
✓ Created: About Us (ID: 123456789)
  URL: /pages/about
  Template: page.about

Creating page: Contact Us...
✓ Created: Contact Us (ID: 123456790)
  URL: /pages/contact
  Template: page.contact

⚠ Page "Meet the Creators" already exists, skipping
  URL: /pages/creators

✓ Pages created: 4/5

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Fetching Resource IDs
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Fetching pages...
✓ Found 5 pages
Fetching collections...
✓ Found 2 collections

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Creating Menu: Main menu
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Converting menu structure...
  ⚠ Collection "abstract-art" not found, using HTTP link
  ⚠ Collection "pop-culture" not found, using HTTP link
Creating menu with GraphQL...
✓ Menu created successfully!
  ID: gid://shopify/Menu/12345
  Handle: main-menu
  Items: 15

Menu structure:
• Home
• Shop
  ↳ By Artist
    ↳ Featured Artists
    ↳ Browse All Artists
  ↳ By Style
    ↳ Abstract
    ↳ Pop Culture
• About
  ↳ About Us
  ↳ Meet the Creators

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Creating Menu: Footer menu
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Converting menu structure...
Creating menu with GraphQL...
✓ Menu created successfully!
  ID: gid://shopify/Menu/12346
  Handle: footer-menu
  Items: 12

═════════════════════════════════════════════
✅ Setup Complete!
═════════════════════════════════════════════

Summary:
  Pages: 5 created
  Menus: 2 created

Next Steps:
  1. Assign menus in Theme Editor
     Shopify Admin → Themes → Customize → Header/Footer
  2. Create missing collections (if needed)
     Abstract Art, Pop Culture, Nature & Landscapes, etc.
  3. Verify pages are using correct templates
     Shopify Admin → Content → Pages
```

---

## Customization

### Add/Remove Pages

Edit the `PAGES` array in `scripts/setup-shopify-navigation.js`:

```javascript
const PAGES = [
  {
    title: 'My Custom Page',
    handle: 'custom',
    body_html: '<p>Content here</p>',
    template_suffix: 'custom', // Uses page.custom.liquid
  },
  // ... more pages
];
```

### Modify Navigation Structure

Edit `MAIN_MENU` or `FOOTER_MENU` objects:

```javascript
const MAIN_MENU = {
  title: 'Main menu',
  handle: 'main-menu',
  items: [
    {
      title: 'My Section',
      url: '#',
      children: [
        { 
          title: 'Sub Item', 
          resource_type: 'page', 
          handle: 'custom' 
        },
      ],
    },
  ],
};
```

### Supported Resource Types

| Type | Description | Example |
|------|-------------|---------|
| `page` | Custom page | `{ resource_type: 'page', handle: 'about' }` |
| `collection` | Product collection | `{ resource_type: 'collection', handle: 'abstract-art' }` |
| `frontpage` | Homepage | `{ resource_type: 'frontpage' }` |
| `policy` | Shopify policy | `{ resource_type: 'policy', handle: 'shipping-policy' }` |
| `http` | Custom URL | `{ url: 'https://example.com' }` |

---

## Troubleshooting

### ❌ Error: "Menu already exists"

**Problem:** The script can't delete existing menus automatically.

**Solution:**
1. Go to Shopify Admin → Content → Menus
2. Delete the existing "Main menu" and/or "Footer menu"
3. Run the script again

### ⚠️ Warning: Missing Collections

**This is normal!** The script creates working links anyway:

```
⚠ Collection "abstract-art" not found, using HTTP link
  URL: /collections/abstract-art
```

**Why this is OK:**
- Links use `/collections/abstract-art` format
- When you create the collection in Shopify, links work automatically
- No need to re-run the script

**Optional:** Create the collections manually:
1. Shopify Admin → Products → Collections
2. Create collections: "Abstract Art", "Pop Culture", etc.
3. Use handles: `abstract-art`, `pop-culture`, `nature-landscapes`, `urban-street`

### ❌ Pages Not Using Custom Templates

**Problem:** Pages exist but don't use the custom template.

**Solution:**
1. Make sure theme is deployed first:
   ```bash
   node scripts/deploy-shopify-theme.js
   ```
2. Go to Shopify Admin → Content → Pages
3. Click the page → Template dropdown
4. Select custom template (e.g., `page.about`)
5. Save

### ❌ API Authentication Error

**Problem:** Script can't connect to Shopify.

**Solution:**
1. Verify environment variables in Replit Secrets:
   - `SHOPIFY_SHOP_URL` (e.g., `your-store.myshopify.com`)
   - `SHOPIFY_ACCESS_TOKEN`
2. Check API token has required scopes:
   - `write_content`
   - `write_online_store_navigation`
3. Test connection:
   ```bash
   curl -X GET "https://your-store.myshopify.com/admin/api/2025-01/pages.json" \
     -H "X-Shopify-Access-Token: your-token"
   ```

---

## Integration with Theme Deployment

### Recommended Workflow

```bash
# Step 1: Deploy theme files first (includes page templates)
node scripts/deploy-shopify-theme.js

# Step 2: Setup navigation (creates pages with templates)
node scripts/setup-shopify-navigation.js
```

**Why this order?**
- Theme deployment creates template files (e.g., `page.about.liquid`)
- Navigation setup assigns templates to pages
- If you run setup first, pages won't have templates assigned

---

## Next Steps After Running Script

### 1. Assign Menus in Theme

**Go to:** Shopify Admin → Online Store → Themes → Customize

**Header Section:**
- Click Header section
- Menu: Select "Main menu"
- Save

**Footer Section:**
- Click Footer section  
- Menu: Select "Footer menu"
- Save

### 2. Verify Pages

**Go to:** Shopify Admin → Content → Pages

**Check:**
- All 5 pages exist
- Each page has correct template assigned
- Page URLs work: `/pages/about`, `/pages/contact`, etc.

### 3. Create Collections (Optional)

**Go to:** Shopify Admin → Products → Collections

**Create these collections:**
- **Featured** (handle: `featured`)
- **Abstract Art** (handle: `abstract-art`)
- **Pop Culture** (handle: `pop-culture`)
- **Nature & Landscapes** (handle: `nature-landscapes`)
- **Urban & Street** (handle: `urban-street`)

**Note:** Collections will automatically link from navigation menus.

### 4. Customize Page Content

**Go to:** Shopify Admin → Content → Pages → Click page

**Update:**
- Page content (text, images)
- SEO title and description
- Visibility settings

**Templates handle most content automatically** - you may not need to edit much!

---

## Manual Setup (Alternative)

If you prefer manual setup or need to troubleshoot, see the old guide:
- [Manual Navigation Setup Guide](./docs/MANUAL_NAVIGATION_SETUP.md) (if available)

---

## Script Location & Source Code

**File:** `scripts/setup-shopify-navigation.js`

**Key Functions:**
- `createPages()` - Creates 5 custom pages with templates (REST API)
- `getResourceIds()` - Fetches page/collection IDs for linking
- `createMenu()` - Creates navigation menus (GraphQL API)
- `convertToGraphQLMenuItems()` - Converts config to GraphQL format

**View source:** Open `scripts/setup-shopify-navigation.js` to see full implementation.

---

## Support

### Need Help?

1. **Check script output** for warnings/errors
2. **Verify credentials** in Replit Secrets
3. **Ensure API scopes** are correct
4. **Review this documentation** for troubleshooting

### Related Documentation

- [Shopify Theme Deployment](./scripts/deploy-shopify-theme.js)
- [CreatorStack Shopify Setup](./CREATORSTACK_SHOPIFY_SETUP.md)
- [Shopify Admin API Docs](https://shopify.dev/docs/api/admin-graphql)

### Common Resources

- Shopify GraphQL Explorer: https://shopify.dev/docs/api/admin-graphql
- Shopify CLI Reference: https://shopify.dev/docs/api/shopify-cli
- Liquid Template Language: https://shopify.dev/docs/api/liquid

---

## Version History

**v2.0 (Current) - Automated Script**
- ✅ Fully automated page and menu creation
- ✅ GraphQL API for menu creation (official 2025 method)
- ✅ Graceful degradation for missing resources
- ✅ Duplicate detection and skipping
- ✅ Production-ready error handling

**v1.0 (Legacy) - Manual Setup**
- Manual page creation in Shopify Admin
- Manual menu configuration
- See old guide for details

---

**Last Updated:** November 2025  
**Script Version:** 2.0  
**Shopify API Version:** 2025-01
