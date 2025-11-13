# Product Mockup Gallery - Deployment Guide

## ✅ What's Already Done
- Printify mockup sync system built and tested
- Database N+1 query issue fixed  
- 21 mockup images successfully uploaded to Shopify for test products
- Template configuration fixed to use correct gallery system

## 🚀 Deploy to Shopify (Choose One Method)

### Method 1: Automated Script (Recommended)
```bash
cd attached_assets/theme
./deploy-product-mockup-gallery.sh
```

### Method 2: Manual Shopify CLI
```bash
cd attached_assets/theme

shopify theme push \
  --store=bvhpq0-hy.myshopify.com \
  --theme=179686146345 \
  --allow-live \
  --only=sections/247-art-product.liquid \
  --only=assets/247-art.js \
  --only=assets/247-art.css \
  --only=assets/247-art-nov13-rebrand.css \
  --only=templates/product.art.json
```

### Method 3: Shopify Admin (Backup Option)
If CLI doesn't work, manually upload these files through Shopify Admin:
1. Go to: Online Store > Themes > Edit Code
2. Upload these files to their respective directories:
   - `sections/247-art-product.liquid`
   - `assets/247-art.js`
   - `assets/247-art.css`  
   - `assets/247-art-nov13-rebrand.css`
   - `templates/product.art.json`

## 🔍 Verification Steps

After deployment:

1. **Visit a test product page:**
   - Stairway to Clouds: https://bvhpq0-hy.myshopify.com/products/stairway-to-clouds
   - Art Deco Facade: https://bvhpq0-hy.myshopify.com/products/art-deco-facade

2. **What you should see:**
   - Image gallery with thumbnails below main image
   - 4 total images per product (1 original artwork + 3 Printify mockups)
   - Clicking thumbnails switches the main image
   - Zoom button in top-right corner of main image

3. **If images don't appear:**
   - Clear your browser cache
   - Check Shopify theme editor to confirm files uploaded
   - Verify mockup images exist in Shopify: Admin > Products > [Product Name] > Media

## 🛠 Technical Details

**Files Deployed:**
- `247-art-product.liquid` - Product page template with gallery markup
- `247-art.js` - JavaScript for image switching, zoom, variant mapping
- `247-art.css` - Styling for gallery components
- `product.art.json` - Template configuration (updated to use 247-art-product)

**What This Fixes:**
- Previous template (`247-product-page.liquid`) used different CSS classes
- JavaScript couldn't find gallery elements (`.gallery__main-image`, `.gallery__thumbnail`)
- Now both template and JavaScript use matching class names

## 📊 Expected Results

**Before Deployment:**
- Products show only 1 image (original artwork)
- No thumbnail gallery

**After Deployment:**
- Products show 4+ images in interactive gallery
- Thumbnail navigation below main image
- Zoom functionality
- Variant selection maps to correct mockup images
