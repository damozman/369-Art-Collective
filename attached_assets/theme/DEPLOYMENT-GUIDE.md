# 369 Art Collective - Shopify Theme Deployment Guide

## 📦 What's Included

This Shopify theme includes two major features:

### ✅ Printify Mockup Gallery (Completed Nov 2024)
- Multi-image gallery with thumbnails
- Automatic Printify mockup sync (3 mockups per artwork)
- Variant-to-image mapping for size/finish selection
- Zoom lightbox functionality

### ✅ **NEW: Live Product Configurator (Nov 2024)**
- **Visual size scaling** - Image scales proportionally when selecting sizes
- **Frame preview overlays** - Realistic black/white frame borders appear/disappear
- **Dynamic pricing** - Automatic +$29 surcharge for framed options
- **Smooth animations** - CSS transitions for professional feel

---

## 🚀 Deployment Options

| Script | What It Deploys | When to Use |
|--------|----------------|-------------|
| **`deploy-live-configurator.sh`** ✅ | Complete product page (mockup gallery + live configurator) | **RECOMMENDED** - Primary deployment for all updates |
| `deploy-product-mockup-gallery.sh` | Legacy gallery-only files | Only for emergency hotfixes to gallery without touching configurator |

---

## 🎯 Deploy Live Configurator (Recommended)

### Method 1: Automated Script
```bash
cd attached_assets/theme
./deploy-live-configurator.sh
```

This deploys:
- `sections/247-art-product.liquid` - Product page section
- `snippets/247-art-options.liquid` - Size/finish/frame option selectors
- `templates/product.art.json` - Template configuration (links section to product pages)
- `assets/247-art.js` - Gallery + configurator JavaScript
- `assets/247-art.css` - Styling for gallery, frames, scaling

### Method 2: Manual Shopify CLI
```bash
cd attached_assets/theme

shopify theme push \
  --store=bvhpq0-hy.myshopify.com \
  --theme=179686146345 \
  --allow-live \
  --only=sections/247-art-product.liquid \
  --only=snippets/247-art-options.liquid \
  --only=templates/product.art.json \
  --only=assets/247-art.js \
  --only=assets/247-art.css
```

### Method 3: Shopify Admin (Manual Upload)
If CLI doesn't work:

1. Go to: **Shopify Admin → Online Store → Themes → Edit Code**
2. Upload these files to their respective directories:
   - **Sections:** `247-art-product.liquid`
   - **Snippets:** `247-art-options.liquid`
   - **Templates:** `product.art.json`
   - **Assets:** `247-art.js`, `247-art.css`

---

## 🧪 QA & Testing Workflow

After deployment, test on Shopify storefront (**not** local Express app):

### Test Products:
- https://bvhpq0-hy.myshopify.com/products/stairway-to-clouds
- https://bvhpq0-hy.myshopify.com/products/art-deco-facade

### ✅ Live Configurator Test Checklist

#### 1. Size Selection & Visual Scaling
- [ ] Select **8x10** → Image should visually shrink (scale 0.70)
- [ ] Select **11x14** → Image should be slightly smaller (scale 0.85)
- [ ] Select **16x20** → Image should be normal size (scale 1.0)
- [ ] Select **18x24** → Image should be slightly larger (scale 1.10)
- [ ] Select **24x36** → Image should be significantly larger (scale 1.30)
- [ ] **Expected:** Smooth 0.5s animation between size changes
- [ ] **Expected:** Image stays centered, doesn't break layout
- [ ] **Regression:** Thumbnail gallery still works

#### 2. Finish Selection & Variant Switching
- [ ] Select **Paper** → Correct mockup image appears
- [ ] Select **Canvas** → Correct mockup image appears
- [ ] Select **Metal** → Correct mockup image appears (if available)
- [ ] **Expected:** Image fades in smoothly (0.4s transition)
- [ ] **Regression:** Zoom button still works

#### 3. Frame Preview Overlays
- [ ] **Initial State:** No frame overlay visible
- [ ] Select **Black Frame** → Realistic black frame border appears
  - Expected: Multi-layer inset shadow creating 3D depth
  - Expected: Smooth fade-in animation
  - Expected: Frame stays aligned with image edges
- [ ] Select **White Frame** → Realistic white frame border appears
  - Expected: Lighter inset shadows
  - Expected: Clean, modern look
- [ ] Select **No Frame** → Frame overlay disappears
  - Expected: Smooth fade-out animation

#### 4. Dynamic Pricing Validation
- [ ] **Baseline Price:** Note the price for 16x20 Paper with No Frame (e.g., $45)
- [ ] Select **Black Frame** → Price should increase by **exactly $29**
- [ ] Select **White Frame** → Price should stay **+$29**
- [ ] Select **No Frame** → Price should return to baseline
- [ ] **Try different sizes** → Frame surcharge always +$29 regardless of size
- [ ] **Try different finishes** → Frame surcharge always +$29 regardless of finish

#### 5. Add to Cart & Line Item Properties
- [ ] Select: **16x20 + Paper + Black Frame**
- [ ] Click **Add to Cart**
- [ ] Open cart → Verify product shows:
  - Correct size (16x20)
  - Correct finish (Paper)
  - Frame choice captured (Black Frame)
  - Correct total price (base + $29)
- [ ] Remove from cart and test again with **White Frame**
- [ ] Test with **No Frame** option

#### 6. Edge Cases & Combinations
Test these specific permutations:
- [ ] **Smallest + Framed:** 8x10 Canvas + White Frame
- [ ] **Largest + Framed:** 24x36 Paper + Black Frame
- [ ] **Switch mid-session:** Start with 11x14 No Frame, then 18x24 Black Frame
- [ ] **Rapid clicks:** Quickly click different sizes/frames → No visual glitches

#### 7. Mockup Gallery Regression
- [ ] Gallery still shows 4+ images (1 artwork + 3 Printify mockups)
- [ ] Clicking thumbnails switches main image
- [ ] Zoom button in top-right corner still works
- [ ] Lightbox opens on zoom click
- [ ] Keyboard navigation (←/→) works in lightbox
- [ ] Close lightbox with X button or Escape key

#### 8. Browser Compatibility
- [ ] Test in Chrome/Edge
- [ ] Test in Firefox
- [ ] Test in Safari
- [ ] Test on mobile (iOS/Android)
- [ ] **Mobile specific:** Frame overlay aligns properly on smaller screens

---

## 🔍 Shopify Preview Workflow

To test without affecting live theme:

1. **Push to Development Theme:**
   ```bash
   shopify theme push \
     --store=bvhpq0-hy.myshopify.com \
     --theme=DEVELOPMENT_THEME_ID \
     --only=sections/247-art-product.liquid \
     --only=snippets/247-art-options.liquid \
     --only=templates/product.art.json \
     --only=assets/247-art.js \
     --only=assets/247-art.css
   ```

2. **View Preview:**
   - Add `?preview_theme_id=DEVELOPMENT_THEME_ID` to product URL
   - Example: `https://bvhpq0-hy.myshopify.com/products/stairway-to-clouds?preview_theme_id=123456789`

3. **Clear Browser Cache:**
   - Hard refresh: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
   - Or open in Incognito/Private window

---

## ⚠️ Troubleshooting

### Live Configurator Not Working
1. **Clear browser cache** - Old JS/CSS files might be cached
2. **Check browser console** - Look for JavaScript errors
3. **Verify files uploaded** - Go to Themes → Edit Code and check files exist
4. **Check product has variants** - Configurator requires size/finish options

### Frame Overlay Not Appearing
1. **Open browser console** → Look for `frameOverlay` initialization
2. **Check CSS loaded** - Inspect element and verify `.frame-overlay` class exists
3. **Try different frame** - Toggle between Black/White/None

### Price Not Updating
1. **Verify Shopify variant prices** - Check Admin → Products → Variants
2. **Check JavaScript** - Console should show "Variant selected: ..." when clicking options
3. **Frame surcharge hardcoded** - Should always be +$29 (2900 cents)

### Mockup Images Missing
1. **Check Shopify Media** - Admin → Products → [Product] → Media
2. **Re-run mockup sync** - `npm run sync-printify-mockups` (from main app, not theme)
3. **Verify image URLs** - Inspect gallery images in browser

---

## 📊 Expected Results

### Before Live Configurator:
- Static product images
- Option selection changes variant/price but no visual feedback
- No frame preview

### After Live Configurator:
- ✅ Image scales when selecting different sizes
- ✅ Realistic frame borders appear/disappear
- ✅ Price updates immediately (+$29 for frames)
- ✅ Smooth animations for all changes
- ✅ Still works with mockup gallery

---

## 🛠 Technical Architecture

### JavaScript Features:
- **Unified Update System:** `updatePreview()` coordinates size, frame, and price
- **Persistent Overlay:** Single `.frame-overlay` element (no DOM churn)
- **CSS Custom Properties:** `--preview-scale` for layout-aware scaling
- **Shopify Integration:** Maps to existing variant selection system

### CSS Features:
- **Size Scaling:** `transform: scale(var(--preview-scale))` with smooth transitions
- **Frame Overlays:** Multi-layer `box-shadow` for 3D depth effect
- **Black Frame:** Dark inset shadows with outer glow
- **White Frame:** Light inset shadows with subtle depth

### Shopify Integration:
- Uses existing variant-to-image mapping from Printify sync
- Frame choice captured via line item properties (see `247-art-lineitem-properties.liquid`)
- Price calculation: Shopify variant price + frame surcharge ($29)

---

## 📝 Development Notes

### Files You Can Safely Modify:
- `assets/247-art.css` - Styling, frame effects, colors
- `assets/247-art.js` - Configurator behavior, scale ratios
- `snippets/247-art-options.liquid` - Option selector UI

### Files to Avoid:
- `templates/product.art.json` - Template config (breaks product page if wrong)
- `sections/247-product-page.liquid` - Legacy file, don't use

### Frame Price Configuration:
To change frame surcharge, edit `assets/247-art.js`:
```javascript
const framePrices = {
  'none': 0,
  'black': 2900, // $29.00 in cents
  'white': 2900  // Change this value
};
```

### Size Scale Configuration:
To adjust visual scaling, edit `assets/247-art.js`:
```javascript
const sizeScales = {
  '8x10': 0.70,  // Adjust these ratios
  '11x14': 0.85,
  '16x20': 1.00,
  '18x24': 1.10,
  '24x36': 1.30
};
```

---

## ✅ Success Criteria

Your deployment is successful when:

1. ✅ Product pages load without errors
2. ✅ Size selection visually scales the image
3. ✅ Frame selection shows realistic borders
4. ✅ Price updates correctly (+$29 for frames)
5. ✅ Add to cart captures all options correctly
6. ✅ Mockup gallery still works (thumbnails, zoom)
7. ✅ Works on mobile and desktop
8. ✅ No JavaScript console errors

If all criteria are met, the live configurator is ready for customers! 🎉
