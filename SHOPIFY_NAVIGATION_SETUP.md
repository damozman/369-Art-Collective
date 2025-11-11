# 247 Print Network - Complete Navigation Setup Guide

## Overview
This guide walks you through deploying all theme files and setting up complete navigation for your Shopify store.

**What You're Deploying:**
- ✅ **30 theme files** (17 sections, 3 snippets, 2 assets, 8 templates)
- ✅ **7 custom pages** (Homepage, About, Contact, Creators, FAQ, Join, Collections)
- ✅ **Complete navigation** (Main menu + Footer menu)

---

## Step 1: Deploy All Theme Files to Shopify

### Prerequisites
1. **Shopify CLI installed** (already installed via `@shopify/cli` package)
2. **Authenticated to Shopify** (run `shopify auth login` if needed)
3. **Store URL set** in environment variables

### Run Deployment

```bash
# Authenticate to Shopify (if not already)
npm run shopify:auth

# Deploy all 30 theme files to development theme
npm run shopify:deploy
```

**Expected Output:**
```
============================================================
  247 Print Network - Shopify Theme Deployment
============================================================

Step 1: Verifying theme files...
✓ Found: attached_assets/theme/sections/247-about-content.liquid
✓ Found: attached_assets/theme/sections/247-art-product.liquid
... (30 files)

✓ All 30 theme files verified!

============================================================
  Step 2: Checking Shopify Authentication
============================================================

✓ Shopify authentication verified

============================================================
  Step 3: Deploying Theme Files
============================================================

Deploying to store: bvhpq0-hy.myshopify.com
Note: Deploying to development theme. Use --live flag for production.

🔧 Uploading all 30 theme files...
✓ Uploading all 30 theme files completed

============================================================
  ✅ Deployment Successful!
============================================================
```

---

## Step 2: Create Pages in Shopify Admin

### Go to Shopify Admin → Content → Pages

**Create 5 new pages** with these exact settings:

| Page Title | Handle (URL) | Template | Description |
|------------|--------------|----------|-------------|
| **About Us** | `about` | `page.about` | Platform mission and how it works |
| **Contact Us** | `contact` | `page.contact` | Contact form and support info |
| **Meet the Creators** | `creators` | `page.creators` | Artist directory with profile cards |
| **FAQs** | `faq` | `page.faq` | Frequently asked questions |
| **Join the Creatorverse** | `join` | `page.join` | Artist recruitment landing page |

### How to Create Each Page:

1. Click **"Add page"**
2. **Title:** Enter the page title (e.g., "About Us")
3. **Content:** Leave blank (the template handles all content)
4. **Template:** Click the dropdown and select the custom template (e.g., `page.about`)
5. Click **"Save"**

**Important:** The template dropdown will only show custom templates AFTER you've deployed the theme files in Step 1.

---

## Step 3: Configure Main Navigation Menu

### Go to Shopify Admin → Content → Menus → Main Menu

**Build this menu structure:**

```
Main Menu
├── Home (/)
├── Shop by Artist 👇
│   ├── Featured Artists (/collections/featured-artists)
│   ├── Abstract Artists (/collections/abstract-art)
│   ├── Nature Artists (/collections/nature-landscapes)
│   ├── Urban Artists (/collections/urban-street)
│   └── Pop Culture Artists (/collections/pop-culture)
├── Shop by Style 👇
│   ├── Abstract Art (/collections/abstract-art)
│   ├── Nature & Landscapes (/collections/nature-landscapes)
│   ├── Urban & Street (/collections/urban-street)
│   └── Pop Culture (/collections/pop-culture)
├── Featured (/collections/featured)
├── About (/pages/about)
├── Meet the Creators (/pages/creators)
└── Contact (/pages/contact)
```

### How to Add Menu Items:

1. Click **"Add menu item"**
2. **Name:** Enter the display name (e.g., "Shop by Artist")
3. **Link:** Select the page/collection from the dropdown or paste the URL
4. For **dropdown menus** (Shop by Artist, Shop by Style):
   - Add the parent item first
   - Click **"Add menu item"** again
   - Drag and drop the child items **under** the parent
   - Indent child items by dragging them to the right
5. Click **"Save menu"**

**Tips:**
- Use the search box to find collections quickly
- Drag items to reorder them
- Indent items to create dropdowns
- Save frequently to avoid losing work

---

## Step 4: Configure Footer Navigation Menu

### Go to Shopify Admin → Content → Menus → Footer Menu

**Build this menu structure:**

```
Footer Menu
├── Shop 👇
│   ├── All Art (/collections/all)
│   ├── Featured (/collections/featured)
│   ├── Abstract Art (/collections/abstract-art)
│   ├── Nature & Landscapes (/collections/nature-landscapes)
│   └── Urban & Street (/collections/urban-street)
├── About 👇
│   ├── About Us (/pages/about)
│   ├── Meet the Creators (/pages/creators)
│   ├── Join as an Artist (/pages/join)
│   └── FAQs (/pages/faq)
├── Support 👇
│   ├── Contact Us (/pages/contact)
│   ├── Shipping Policy (/policies/shipping-policy)
│   ├── Refund Policy (/policies/refund-policy)
│   └── Privacy Policy (/policies/privacy-policy)
└── Legal 👇
    ├── Terms of Service (/policies/terms-of-service)
    └── Privacy Policy (/policies/privacy-policy)
```

**Note:** Shopify auto-generates policy pages. You can customize them under **Settings → Policies**.

---

## Step 5: Customize Homepage Sections

### Go to Shopify Admin → Themes → Customize (Development Theme)

**Add these sections in order:**

1. **247 Homepage Hero**
   - Main headline, subheadline, CTA buttons
   - Background image/gradient

2. **247 Featured Collections**
   - Shows 4 featured art collections
   - Links to Abstract, Nature, Urban, Pop Culture

3. **247 Featured Artists**
   - Displays 3-4 featured artist profiles
   - Artist avatars, bios, artwork counts

4. **247 Merch Preview** (Coming Soon)
   - Shows upcoming merchandise categories
   - Apparel, Home & Living, Accessories

5. **247 Trust Badges**
   - Free Shipping, Secure Checkout, Artist Support
   - Quality Guarantee, Easy Returns

### How to Add Sections:

1. Click **"Add section"** button
2. Search for "247" to see all custom sections
3. Select the section to add
4. Configure section settings (text, images, links)
5. Click **"Save"**

**Tips:**
- Preview on desktop and mobile before saving
- Use high-quality images (1200px+ width)
- Keep hero headlines concise and punchy
- Test all CTA buttons

---

## Step 6: Test All Navigation & Pages

### Testing Checklist

**Main Menu:**
- [ ] Click every menu item
- [ ] Test dropdown menus (Shop by Artist, Shop by Style)
- [ ] Verify all links go to correct pages/collections
- [ ] Test on mobile (hamburger menu)

**Footer Menu:**
- [ ] Click every footer link
- [ ] Verify all dropdowns work
- [ ] Check policy pages load correctly
- [ ] Test responsive layout on mobile

**Custom Pages:**
- [ ] About Us page displays correctly
- [ ] Contact form works and sends emails
- [ ] Meet the Creators shows artist directory
- [ ] FAQs accordion expands/collapses
- [ ] Join page has working CTAs

**Homepage:**
- [ ] Hero section displays with correct CTAs
- [ ] Featured collections show 4 collections
- [ ] Featured artists display with images
- [ ] Merch preview shows "Coming Soon" badges
- [ ] Trust badges render correctly

**Collections:**
- [ ] Abstract Art collection loads
- [ ] Nature & Landscapes collection loads
- [ ] Urban & Street collection loads
- [ ] Pop Culture collection loads
- [ ] Featured collection loads

**Product Pages:**
- [ ] Art products use custom template
- [ ] Size/Finish/Frame selectors work
- [ ] Multi-image gallery switches on variant change
- [ ] Add to cart button works
- [ ] Merch upsell appears at bottom

---

## Step 7: Publish Theme

### Go to Shopify Admin → Themes

1. Find your **Development theme** (just deployed)
2. Click **"..."** (three dots)
3. Click **"Publish"**
4. Confirm publication

**Warning:** This will replace your current live theme. Make sure you've tested everything first!

---

## Troubleshooting

### Theme Files Not Deploying
```bash
# Re-authenticate
shopify auth logout
shopify auth login

# Verify store connection
shopify whoami

# Try deployment again
npm run shopify:deploy
```

### Templates Not Showing in Dropdown
- Make sure you deployed theme files FIRST
- Refresh Shopify Admin
- Check that template files are in development theme (Themes → Actions → Edit code)

### Navigation Menu Not Saving
- Save frequently (every 2-3 items)
- Don't add too many items at once
- Clear browser cache if menu looks wrong
- Try incognito/private window

### Pages Not Using Custom Templates
- Go to Pages → Click page → Template dropdown
- Select the correct custom template (e.g., `page.about`)
- Click "Save"

### Collections Not Found
- Make sure collections exist in Shopify Admin
- Go to Products → Collections
- Create collections if missing (Abstract Art, Nature & Landscapes, etc.)
- Use exact handles from the guide

---

## What's Next?

After deployment and navigation setup:

1. **Add Products:**
   - Upload artwork via Replit artist dashboard
   - Approve artwork in admin dashboard
   - Artwork auto-publishes to Shopify

2. **Configure Email Notifications:**
   - Shopify Admin → Settings → Notifications
   - Customize order confirmation emails
   - Set up abandoned cart recovery

3. **Set Up Analytics:**
   - Google Analytics
   - Facebook Pixel
   - Shopify Analytics (built-in)

4. **Marketing:**
   - Share artist recruitment page (/pages/join)
   - Drive traffic to featured collections
   - Launch influencer affiliate program

---

## File Reference

**Deployed Theme Files:**

**Sections (17):**
- 247-about-content.liquid
- 247-art-product.liquid
- 247-artist-cta-banner.liquid
- 247-collection-grid.liquid
- 247-collection-header.liquid
- 247-contact-form.liquid
- 247-creators-grid.liquid
- 247-faq-accordion.liquid
- 247-featured-artists.liquid
- 247-featured-artworks.liquid
- 247-featured-collections.liquid
- 247-homepage-hero.liquid
- 247-join-benefits.liquid
- 247-join-cta.liquid
- 247-merch-preview.liquid
- 247-page-hero.liquid
- 247-trust-badges.liquid

**Snippets (3):**
- 247-art-options.liquid (variant selectors)
- 247-art-lineitem-properties.liquid (cart properties)
- 247-merch-upsell.liquid (product page upsell)

**Assets (2):**
- 247-art.js (variant selection logic)
- 247-art.css (Displate-inspired styling)

**Templates (8):**
- index.json (homepage)
- collection.json (collection pages)
- page.about.json (About Us)
- page.contact.json (Contact Us)
- page.creators.json (Meet the Creators)
- page.faq.json (FAQs)
- page.join.json (Join the Creatorverse)
- product.art.json (Art product pages)

---

## Support

**Need Help?**
- Check [SHOPIFY_SETUP_GUIDE.md](./SHOPIFY_SETUP_GUIDE.md) for detailed instructions
- Review [CREATORSTACK_SHOPIFY_SETUP.md](./CREATORSTACK_SHOPIFY_SETUP.md) for CreatorStack integration
- Contact Shopify Support for platform-specific issues

**Common Resources:**
- Shopify Theme Documentation: https://shopify.dev/docs/themes
- Liquid Template Language: https://shopify.dev/docs/api/liquid
- Shopify CLI Reference: https://shopify.dev/docs/api/shopify-cli
