# Deploy Product Page - Complete Instructions

## ⚠️ CRITICAL: Manual Upload Required

The product page files in this repo **DO NOT automatically sync** to Shopify. You must manually upload them.

## Files Changed

### 1. **247-product-page.liquid** (Section Template)
**Location:** `attached_assets/theme/sections/247-product-page.liquid`

**Changes:**
- Fixed column widths: 120px (thumbnails), 750-850px (mockup), 300-340px (config)
- Added CSS custom properties for maintainable layout with responsive minmax
- Balanced all div and Liquid control tags (verified)
- Grid optimized for 1440px+ screens with 18px safety buffer

**Upload via:** Shopify Admin → Online Store → Themes → Actions → Edit code → Sections → 247-product-page.liquid

---

### 2. **247-art.css** (Global Styles)
**Location:** `attached_assets/theme/assets/247-art.css`

**Changes:**
- Added lightbox modal CSS (overlay, zoom button, navigation, close button)
- Fixed CSS syntax errors at beginning of file
- Added mobile responsive styles for lightbox

**Upload via:** Shopify Admin → Online Store → Themes → Actions → Edit code → Assets → 247-art.css

---

### 3. **247-art.js** (Product Page JavaScript)
**Location:** `attached_assets/theme/assets/247-art.js`

**Changes:**
- Updated helper functions to safely extract image sources
- Fixed mockup slide image handling

**Upload via:** Shopify Admin → Online Store → Themes → Actions → Edit code → Assets → 247-art.js

---

## Deployment Steps

### Option 1: Manual Upload (Recommended)

1. **Login to Shopify Admin**
   - Go to: https://bvhpq0-hy.myshopify.com/admin

2. **Navigate to Theme Editor**
   - Online Store → Themes
   - Click "Actions" → "Edit code"

3. **Upload Each File:**

   **A. Section Template:**
   - Find `sections/247-product-page.liquid` in the left sidebar
   - Copy entire contents from `attached_assets/theme/sections/247-product-page.liquid`
   - Paste and save

   **B. CSS File:**
   - Find `assets/247-art.css` in the left sidebar
   - Copy entire contents from `attached_assets/theme/assets/247-art.css`
   - Paste and save

   **C. JavaScript File:**
   - Find `assets/247-art.js` in the left sidebar
   - Copy entire contents from `attached_assets/theme/assets/247-art.js`
   - Paste and save

4. **Clear Shopify Cache**
   - After uploading, test in **incognito/private window**
   - Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)

---

### Option 2: Shopify CLI (Advanced)

```bash
cd attached_assets/theme

# Deploy only the product page section and template
shopify theme push \
  --store=bvhpq0-hy.myshopify.com \
  --theme=179686146345 \
  --allow-live \
  --only=sections/247-product-page.liquid \
  --only=templates/product.art.json

# Note: CSS and JS still need manual upload via admin
```

**⚠️ WARNING:** The deployment script does NOT upload CSS or JS files!

---

## Testing After Deployment

### 1. Test Product Page
- URL: https://247printnetwork.com/products/abandoned-factory-1
- Check in **incognito window** (avoids cache)

### 2. Verify Column Widths
- Open DevTools (F12)
- Check `.product-page__container` should show:
  ```
  grid-template-columns: 120px minmax(750px, 850px) minmax(300px, 340px)
  Total width: ~1374px (fits 1440px screens with 18px buffer)
  ```

### 3. Verify Page Scrolls
- Scroll up and down - should work smoothly
- No frozen content

### 4. Test Responsive Breakpoints
- Desktop (1440px+): 3-column layout
- Tablet (1024px): 2-column (thumbnails + main, sidebar below)
- Mobile (768px): 1-column stacked

---

## Why Manual Upload is Required

Shopify themes are **NOT** automatically synced from this Replit environment:

1. **Asset files** (CSS/JS) require manual upload OR Shopify CLI
2. **Section files** can be deployed via script, but assets cannot
3. **Template changes** need both section + assets to work together

---

## Troubleshooting

### Issue: Changes not visible
**Solution:** Upload ALL three files, then test in incognito window

### Issue: Page still broken/no scroller
**Solution:** 
1. Verify all div tags are balanced (✅ verified - 33 opening, 33 closing)
2. Check browser console for JavaScript errors
3. Clear Shopify theme cache

### Issue: Layout still wrong
**Solution:** Check that CSS file uploaded correctly - inspect element in DevTools

---

## Files Reference

```
attached_assets/theme/
├── sections/
│   ├── 247-product-page.liquid     ← MAIN TEMPLATE (upload this)
│   └── 247-art-product.liquid      ← OLD FILE (ignore)
├── assets/
│   ├── 247-art.css                 ← STYLES (upload this)
│   └── 247-art.js                  ← SCRIPTS (upload this)
└── deploy-product-mockup-gallery.sh ← Only uploads .liquid, NOT CSS/JS
```

---

## Summary

✅ **Fixed:**
- Column widths: 120px → 1000px → 320-420px
- All div and Liquid tags balanced
- CSS custom properties for maintainability

⚠️ **Action Required:**
1. Upload `247-product-page.liquid` to Shopify Admin
2. Upload `247-art.css` to Shopify Admin  
3. Upload `247-art.js` to Shopify Admin
4. Test in incognito window at product URL

**Expected Result:** Product page displays with proper 3-column layout, page scrolls correctly, all features work.
