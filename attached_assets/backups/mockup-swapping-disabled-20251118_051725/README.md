# 🔧 Mockup-Swapping DISABLED - November 18, 2025 05:17:25

## ⚠️ Status: DISABLED (Waiting for Images)

This backup contains the mockup-swapping system **ready to activate** but currently **disabled** until the mockup images are created and uploaded.

## 🐛 What Happened

The mockup-swapping code was trying to load images that don't exist yet:
- `mockup-living-small.png` ❌ Not uploaded
- `mockup-living-medium.png` ❌ Not uploaded

This caused **thumbnail 2 to break** - no image displayed.

## ✅ Fix Applied

**Temporarily disabled mockup swapping code** (lines 387-406 in 247-art.js are commented out)

The gallery now works normally:
- ✅ Thumbnail 1: Static product image (working)
- ✅ Thumbnail 2: Living room mockup with scaling overlay (working)
- ✅ Thumbnails 3-5: Mockup with scaling overlay (working)

## 🎯 How to Activate Mockup Swapping

### Step 1: Create the Mockup Images

Create these two images with different camera angles:

**mockup-living-small.png**
- Close-up view of the wall
- Artwork appears larger in frame
- For 8x10 and 11x14 sizes

**mockup-living-medium.png**
- Mid-range view of the room
- Balanced wall/room context
- For 12x16 and 16x20 sizes

**mockup-living.png** (already exists)
- Wide-angle view
- Gallery context with room
- For 18x24 and 24x36 sizes

### Step 2: Upload Images to Shopify

Add these files to `attached_assets/theme/assets/`:
```bash
# Place your images here:
attached_assets/theme/assets/mockup-living-small.png
attached_assets/theme/assets/mockup-living-medium.png
```

### Step 3: Uncomment the Code

In `attached_assets/theme/assets/247-art.js` (lines 387-406):

**Find this:**
```javascript
// THUMBNAIL 2 (Living Room): Swap mockup image based on size group
// DISABLED until mockup-living-small.png and mockup-living-medium.png are created
// Uncomment this block once the images are uploaded to Shopify assets
/*
const livingRoomSlide = document.querySelector('[data-mockup-room="living-room"]');
...
*/
```

**Change to this:**
```javascript
// THUMBNAIL 2 (Living Room): Swap mockup image based on size group
const livingRoomSlide = document.querySelector('[data-mockup-room="living-room"]');
if (livingRoomSlide && MOCKUP_IMAGES['living-room']) {
  const backgroundImg = livingRoomSlide.querySelector('.mockup-slide__background');
  const mockupFilename = MOCKUP_IMAGES['living-room'][sizeGroup];
  
  if (backgroundImg && mockupFilename) {
    // Build asset URL - extract base path from current src and replace filename
    const currentSrc = backgroundImg.src;
    const lastSlash = currentSrc.lastIndexOf('/');
    const basePath = currentSrc.substring(0, lastSlash + 1);
    const newSrc = basePath + mockupFilename;
    
    // Update mockup background image
    backgroundImg.src = newSrc;
    
    console.log(`Living room mockup swapped: ${extractedSize} (${sizeGroup}) → ${mockupFilename}`);
  }
}
```

### Step 4: Deploy

```bash
npx tsx scripts/deploy-art-fix.ts
```

### Step 5: Test

Hard refresh (Ctrl+Shift+R) and click size buttons:
- Click **8x10** → Should swap to small mockup
- Click **16x20** → Should swap to medium mockup
- Click **24x36** → Should swap to large mockup

## 📋 Current Configuration

### What's Working Now
✅ All thumbnails display correctly
✅ Size scaling works (overlay resizes)
✅ Frame selection works
✅ No broken images

### What's Disabled
❌ Mockup image swapping for thumbnail 2
❌ All sizes use `mockup-living.png` (wide-angle view)

## 🎨 Design Guidance for Images

### Mockup-Living-Small.png (Close-Up)
- Camera zoomed into wall area
- Artwork fills more of the frame
- Show wall texture, maybe part of furniture
- Makes 8x10 and 11x14 prints feel appropriately sized

### Mockup-Living-Medium.png (Mid-Range)
- Balanced room and wall view
- Show artwork in context but not too distant
- Include some furniture for scale
- Makes 12x16 and 16x20 feel natural

### Mockup-Living.png (Wide-Angle) - Already Exists
- Full room context
- Artwork as part of gallery wall
- Perfect for large prints (18x24, 24x36)

## 🔧 Technical Details

**Size Groups:**
- Small: 8x10, 11x14 → `mockup-living-small.png`
- Medium: 12x16, 16x20 → `mockup-living-medium.png`
- Large: 18x24, 24x36 → `mockup-living.png`

**Code Location:**
- Constants: Lines 22-50 in 247-art.js
- Swapping logic: Lines 387-406 (currently commented out)
- Size detection: `getSizeGroup()` function

## 📦 Restore Instructions

This is already the active version - no restore needed.

---

**NEXT STEP**: Create mockup images, then uncomment the code and redeploy! 🎨
