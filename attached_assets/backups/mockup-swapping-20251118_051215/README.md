# 🔄 Mockup-Swapping System - November 18, 2025 05:12:15

## 🎯 Feature: Size-Based Mockup Image Swapping (Thumbnail 2)

This backup introduces a **proportional sizing approach** for thumbnail 2 (living room mockup) that swaps between different mockup images based on selected print size, creating more realistic size representations.

## 🆕 What Changed

### Previous Behavior (Scaling Approach)
- One mockup image for all sizes
- Overlay scales from tiny (8x10) to large (24x36)
- Small sizes looked unrealistic - tiny artwork on large wall
- Large sizes looked great

### New Behavior (Swapping Approach)
- **Three mockup images** per room (small/medium/large)
- Click **8x10 or 11x14** → Load close-up mockup (small group)
- Click **12x16 or 16x20** → Load mid-range mockup (medium group)
- Click **18x24 or 24x36** → Load wide-angle mockup (large group)
- Overlay stays **proportionally sized** to feel natural in each space

## 📐 Size Groups

```javascript
MOCKUP_SIZE_GROUPS = {
  'small': ['8x10', '11x14'],   // Close-up mockup
  'medium': ['12x16', '16x20'], // Mid-range mockup
  'large': ['18x24', '24x36']   // Wide-angle mockup (current mockup-living.png)
}
```

## 🖼️ Required Mockup Images

**For Living Room (Thumbnail 2):**
- ✅ `mockup-living.png` - Wide-angle view (already exists) → Used for 18x24, 24x36
- ⏳ `mockup-living-medium.png` - Mid-range view (needs creation) → For 12x16, 16x20
- ⏳ `mockup-living-small.png` - Close-up view (needs creation) → For 8x10, 11x14

**Until new images are created:**
- System falls back to `mockup-living.png` for all sizes
- **No errors** - graceful degradation

## 🛠️ How It Works

### JavaScript Logic (247-art.js)

1. **Size Selection Handler** → Detects which size group (small/medium/large)
2. **getSizeGroup()** → Maps size to group
3. **updateSizePreview()** → Swaps mockup background image for thumbnail 2 only
4. **Proportional Overlay** → Artwork overlay maintains natural proportions using SIZE_SCALE_FACTORS

### Code Example
```javascript
// User clicks 8x10 size button
→ getSizeGroup('8x10') returns 'small'
→ MOCKUP_IMAGES['living-room']['small'] = 'mockup-living-small.png'
→ Swap background image in thumbnail 2
→ Apply proportional scale (0.256) to overlay
```

## 🎨 Design Philosophy

**Overlay stays proportionally sized** - artwork doesn't dramatically change size, mockup perspective changes instead.

**Small sizes (8x10, 11x14):**
- Close-up mockup shows artwork at reasonable screen size
- Feels intimate and proportionally accurate

**Medium sizes (12x16, 16x20):**
- Mid-range mockup balances wall context with artwork clarity
- Transitional perspective

**Large sizes (18x24, 24x36):**
- Wide-angle mockup shows gallery context
- Artwork feels appropriately substantial on wall

## 🎯 What's Active

✅ **Thumbnail 1** - Static product image (no mockup)
✅ **Thumbnail 2** - Living room with size-based mockup swapping (NEW!)
⏸️ **Thumbnails 3-5** - Keep current scaling behavior (can be updated later)

## 📝 Next Steps

### To Fully Activate This Feature:

1. **Create mockup images:**
   - `mockup-living-small.png` - Close-up camera angle
   - `mockup-living-medium.png` - Mid-range camera angle
   - Keep current `mockup-living.png` as wide-angle

2. **Upload to Shopify assets:**
   ```bash
   npx tsx scripts/deploy-art-fix.ts
   ```

3. **Test all size selections:**
   - Click 8x10 → Should load small mockup
   - Click 16x20 → Should load medium mockup
   - Click 24x36 → Should load large mockup

4. **Expand to other rooms (optional):**
   - Add bedroom/office/gallery to MOCKUP_IMAGES object
   - Create 3 mockup variants per room
   - System automatically handles swapping for all rooms

## 🔧 Technical Details

### Constants Added
```javascript
MOCKUP_SIZE_GROUPS - Maps sizes to groups
MOCKUP_IMAGES - Maps rooms to mockup filenames
getSizeGroup(size) - Helper function
```

### Modified Functions
```javascript
updateSizePreview(size) - Now swaps mockup images for thumbnail 2
```

### Asset Path Construction
```javascript
// Extracts base path from current image
const basePath = currentSrc.substring(0, lastSlash + 1);
const newSrc = basePath + mockupFilename;
backgroundImg.src = newSrc;
```

## 🎯 Benefits

✅ More **accurate size representation** for small prints
✅ **Proportional overlay sizing** feels natural
✅ **No dramatic scaling animations** - cleaner UX
✅ Easy to expand to other room types
✅ Graceful fallback if images don't exist

## 🔄 Reverting

To restore scaling behavior:
```bash
cp attached_assets/backups/COMPLETE-gallery-viewer-20251118_045836/*.js attached_assets/theme/assets/
npx tsx scripts/deploy-art-fix.ts
```

## 📊 File Changes

- ✅ `247-art.js` - Added size groups, mockup mapping, swapping logic
- ⚫ `247-art.css` - No changes
- ⚫ `247-art-product.liquid` - No changes
- ⚫ `product.art.json` - No changes

---

**STATUS**: Ready for mockup image creation! System deployed and functional with fallback behavior. 🚀
