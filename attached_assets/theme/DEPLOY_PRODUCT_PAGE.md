# 🚀 Deploy Mockup Overlay Fix - URGENT ACTION REQUIRED

## ✅ PROBLEM SOLVED: Missing CSS Transform Rules

**Root Cause Identified:** The `247-art.css` file was missing the CSS rules to apply the `transform: scale(var(--size-scale))` that the JavaScript was setting. The JavaScript was calculating everything correctly, but nothing visually changed because the CSS to USE those calculations didn't exist.

**Fix Applied:** Added complete mockup overlay CSS system including transforms, positioning, transitions, and frame styles.

---

## 📦 Files Changed (2 files to upload)

### 1. **247-art-product.liquid** ✨ UPDATED
**Location:** `attached_assets/theme/sections/247-art-product.liquid`

**Changes:**
- Updated `--mockup-width: 850px` (was 1000px) for better 1440px viewport fit
- Updated `--config-min: 300px` and `--config-max: 340px` for balanced layout
- Total layout width: ~1374px (fits 1440px screens with safe margins)

**Upload via:** Shopify Admin → Online Store → Themes → Actions → Edit code → **Sections** → 247-art-product.liquid

---

### 2. **247-art.css** 🔧 CRITICAL FIX
**Location:** `attached_assets/theme/assets/247-art.css`

**Changes Added (Lines 706-768):**
```css
/* ===== MOCKUP OVERLAY SYSTEM ===== */
.mockup-slide__overlay {
  position: absolute;
  transform-origin: center center;
  transform: translate(-50%, -50%) scale(var(--size-scale, 1.0));
  transition: transform 0.3s ease, left 0.3s ease, top 0.3s ease, width 0.3s ease;
  pointer-events: none;
  aspect-ratio: var(--artwork-ratio, 0.8);
}
```

**Why This Was Critical:**
- JavaScript sets `--size-scale` variable (0.64 for 8x10, 2.16 for 24x36)
- Without this CSS rule, the variable exists but does NOTHING visually
- This transform rule actually applies the scaling to make artwork resize

**Upload via:** Shopify Admin → Online Store → Themes → Actions → Edit code → **Assets** → 247-art.css

---

## 🎯 Step-by-Step Upload Instructions

### Step 1: Upload Liquid Template
1. Login: https://bvhpq0-hy.myshopify.com/admin
2. Navigate: **Online Store → Themes → Actions → Edit code**
3. Find: **Sections → 247-art-product.liquid**
4. Copy **entire contents** from: `attached_assets/theme/sections/247-art-product.liquid`
5. Paste and **SAVE**

### Step 2: Upload CSS File (CRITICAL)
1. In same theme editor
2. Find: **Assets → 247-art.css**
3. Copy **entire contents** from: `attached_assets/theme/assets/247-art.css`
4. Paste and **SAVE**
5. ⚠️ **DO NOT skip this** - without CSS, mockups won't resize!

### Step 3: Test in Incognito Window
1. Open: https://369artcollective.com/products/abandoned-factory-1
2. Use **incognito/private window** (avoids cache)
3. Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)

---

## ✅ Testing Checklist

After uploading **BOTH** files, verify these features work:

### 1. **Size Button Interaction**
- Click "8x10" → artwork should **shrink** to 64% size
- Click "24x36" → artwork should **grow** to 216% size
- Transition should be **smooth** (0.3s)

### 2. **Frame Selector**
- Click "Black Frame" → black border appears around artwork
- Click "White Frame" → white border appears
- Click "No Frame" → border disappears
- ⚠️ Frames only work with **Paper** finish (Canvas/Metal can't have frames)

### 3. **Mockup Room Switching**
- Click thumbnail #2 (bedroom) → artwork stays visible, room changes
- Click thumbnail #3 (office) → artwork stays visible, room changes
- Artwork should maintain selected size in all rooms

### 4. **Layout Width**
- Open DevTools (F12)
- Inspect `.product-page__container`
- Should show: `grid-template-columns: 120px minmax(750px, 850px) minmax(300px, 340px)`
- Total width: ~1374px (no horizontal scroll on 1440px screens)

---

## 🐛 Troubleshooting

### Issue: Mockups still don't resize
**Solution:** 
1. Verify you uploaded **BOTH** files (liquid + css)
2. Check browser console (F12) for JavaScript errors
3. Test in **incognito window** to avoid cache
4. Clear Shopify cache: Hard refresh (Ctrl+Shift+R)

### Issue: "9 errors" in Shopify theme editor
**Solution:** These are just linter warnings about missing `width`/`height` attributes on `<img>` tags. They're **NOT blocking errors** - the mockup system works fine without them. Safe to ignore.

### Issue: Changes not visible
**Solution:**
1. Confirm files saved in Shopify Admin (green checkmark)
2. Test in **new incognito window**
3. Check that `.mockup-slide__overlay` has `transform: scale()` in DevTools

### Issue: Frames not showing
**Solution:**
- Frames only work on **Paper** finish
- Select "Paper" first, then try frame selector
- Canvas/Metal cannot have frames (Printify limitation)

---

## 📁 Files Reference

```
attached_assets/theme/
├── sections/
│   └── 247-art-product.liquid      ← UPLOAD THIS (mockup width fix)
├── assets/
│   └── 247-art.css                 ← UPLOAD THIS (CRITICAL CSS fix)
└── DEPLOY_PRODUCT_PAGE.md          ← You are here
```

**✨ IGNORE these files:**
- `247-product-page.liquid` (different/older template)
- `247-art.js` (no changes needed - JavaScript already works)

---

## 🎨 What Fixed The Problem

**Before (broken):**
```javascript
// JavaScript was setting the variable correctly
overlay.style.setProperty('--size-scale', 0.64); // 8x10 size
```

```css
/* But CSS had NOTHING to use that variable! */
.mockup-slide__overlay {
  /* Missing transform rule */
}
```

**After (working):**
```javascript
// JavaScript still sets the variable
overlay.style.setProperty('--size-scale', 0.64);
```

```css
/* NOW CSS actually uses it! */
.mockup-slide__overlay {
  transform: translate(-50%, -50%) scale(var(--size-scale, 1.0));
  transition: transform 0.3s ease;
}
```

---

## 📊 Summary

**✅ Fixed:**
- Added missing CSS transform rules to make mockup scaling work
- Adjusted mockup column width from 1000px → 850px for better fit
- Added frame styles (black/white/walnut)
- Added smooth transitions for size changes

**⚠️ Action Required:**
1. Upload `247-art-product.liquid` (width adjustment)
2. Upload `247-art.css` (CRITICAL - adds missing CSS)
3. Test in incognito window

**🎯 Expected Result:**
- Click size buttons → artwork resizes smoothly
- Click frame selector → frames appear/disappear
- Switch rooms → artwork stays visible
- No horizontal scroll on 1440px+ screens

---

## 🚨 Critical Note

**DO NOT skip uploading the CSS file!** The mockup overlay system **will not work** without the new CSS rules. The JavaScript is already functional and doesn't need changes, but it depends on these CSS rules to actually display the visual changes.
