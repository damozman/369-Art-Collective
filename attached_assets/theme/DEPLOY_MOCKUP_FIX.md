# 🚀 Deploy Mockup Overlay Fix - Step-by-Step Guide

## ✅ **What's Fixed:**

The mockup overlay system now has the CSS it needs to work. Your JavaScript has always worked perfectly - it just had nothing to apply the scaling to!

**Changes Made:**
1. ✅ Added mockup overlay CSS to `247-art.css` (transform, positioning, frames)
2. ✅ Updated mockup width to 850px in `247-art-product.liquid` (better 1440px viewport fit)
3. ✅ Added thumbnail gallery with vertical scroll (7 thumbnails visible)
4. ✅ Fixed vertical alignment - all columns now align at top with no buffer spacing

---

## 📦 **Files to Upload (2 files)**

### File 1: `247-art.css` (CRITICAL - contains the fix)
**Shopify Location:** `Assets/247-art.css`  
**Replit Location:** `attached_assets/theme/assets/247-art.css`

### File 2: `247-art-product.liquid` (width adjustment)
**Shopify Location:** `Sections/247-art-product.liquid`  
**Replit Location:** `attached_assets/theme/sections/247-art-product.liquid`

---

## 🎯 **Upload Instructions**

### **Step 1: Login to Shopify**
1. Open browser: https://bvhpq0-hy.myshopify.com/admin
2. Enter your Shopify credentials
3. Click "Login"

### **Step 2: Open Theme Code Editor**
1. Click **"Online Store"** in left sidebar
2. Click **"Themes"**
3. Find your live theme (should say "Current theme")
4. Click **"Actions"** dropdown button
5. Select **"Edit code"**

You're now in the Theme Code Editor!

---

### **Step 3: Upload CSS File (CRITICAL)**

1. **In Shopify Theme Editor:**
   - Look at the left sidebar folders
   - Find and click the **"Assets"** folder to expand it
   - Scroll down and click **"247-art.css"** to open it

2. **In Replit (this project):**
   - Look at left file tree
   - Navigate to: `attached_assets/theme/assets/247-art.css`
   - Click to open the file
   - Press **Ctrl+A** (Windows) or **Cmd+A** (Mac) to select all
   - Press **Ctrl+C** (Windows) or **Cmd+C** (Mac) to copy

3. **Back in Shopify:**
   - Click inside the code editor
   - Press **Ctrl+A** (Windows) or **Cmd+A** (Mac) to select all existing code
   - Press **Ctrl+V** (Windows) or **Cmd+V** (Mac) to paste new code
   - Click the green **"Save"** button in top-right corner
   - Wait for "Saved" confirmation message

✅ **File 1 of 2 uploaded!**

---

### **Step 4: Upload Liquid Template File**

1. **In Shopify Theme Editor:**
   - Look at the left sidebar folders
   - Find and click the **"Sections"** folder to expand it
   - Scroll down and click **"247-art-product.liquid"** to open it

2. **In Replit (this project):**
   - Navigate to: `attached_assets/theme/sections/247-art-product.liquid`
   - Click to open the file
   - Press **Ctrl+A** or **Cmd+A** to select all
   - Press **Ctrl+C** or **Cmd+C** to copy

3. **Back in Shopify:**
   - Click inside the code editor
   - Press **Ctrl+A** or **Cmd+A** to select all
   - Press **Ctrl+V** or **Cmd+V** to paste
   - Click the green **"Save"** button
   - Wait for "Saved" confirmation

✅ **File 2 of 2 uploaded!**

---

## 🧪 **Test Your Changes**

### **Step 1: Open Product Page in Incognito Window**

**Why incognito?** This bypasses your browser cache so you see the actual new code.

1. **Open Incognito/Private Window:**
   - **Chrome/Edge:** Press Ctrl+Shift+N (Windows) or Cmd+Shift+N (Mac)
   - **Firefox:** Press Ctrl+Shift+P (Windows) or Cmd+Shift+P (Mac)
   - **Safari:** Press Cmd+Shift+N (Mac)

2. **Go to product page:**
   ```
   https://247printnetwork.com/products/abandoned-factory-1
   ```

3. **Hard refresh the page:**
   - Press Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)

---

### **Step 2: Test Size Buttons**

1. **Look at the mockup preview** (room with artwork on wall)
2. **Find size selector buttons** on the right (8x10, 11x14, 16x20, 18x24, 24x36)

**Tests:**
- ✅ Click **"8x10"** → Artwork should **shrink** smoothly to small size
- ✅ Click **"24x36"** → Artwork should **grow** smoothly to large size
- ✅ Click **"16x20"** → Artwork should resize to medium size
- ✅ Transition should be **smooth** (0.3 second animation)

**Expected behavior:** The artwork on the wall should change size in real-time as you click different sizes.

---

### **Step 3: Test Frame Selector**

**IMPORTANT:** Frames only work on **Paper** finish!

1. **Select "Paper" finish** first (if not already selected)
2. **Find frame selector** buttons (No Frame, Black Frame, White Frame, Walnut Frame)

**Tests:**
- ✅ Click **"Black Frame"** → Black border appears around artwork
- ✅ Click **"White Frame"** → Changes to white border
- ✅ Click **"Walnut Frame"** → Changes to brown/wood border
- ✅ Click **"No Frame"** → Border disappears

**Note:** If you select Canvas or Metal finish, frames will be disabled (Printify limitation).

---

### **Step 4: Test Room Switching**

1. **Look at thumbnail images** on left side (or dots below main image on mobile)
2. **Click different room thumbnails:**

**Tests:**
- ✅ Click **Bedroom thumbnail** → Room changes, artwork stays visible
- ✅ Click **Office thumbnail** → Room changes, artwork stays visible
- ✅ Click **Gallery thumbnail** → Room changes, artwork stays visible
- ✅ Click **Living Room thumbnail** → Returns to first room

**Expected behavior:** Artwork should maintain its selected size and frame across all room previews.

---

### **Step 5: Test Viewport Width**

1. **Open DevTools:** Press F12
2. **Check page width:**
   - Page should fit within 1440px viewport
   - No horizontal scrollbar should appear
   - Layout should look balanced

**On 1440px+ screens:**
- ✅ Thumbnails: 120px wide
- ✅ Mockup preview: ~850px wide
- ✅ Configuration panel: 300-340px wide
- ✅ Total layout: ~1374px (fits comfortably with margins)

---

## ❌ **Troubleshooting**

### **Issue: Mockup overlay doesn't resize when clicking sizes**

**Most likely cause:** CSS file wasn't uploaded correctly

**Solution:**
1. Go back to Shopify theme editor
2. Open `Assets/247-art.css`
3. Press Ctrl+F (or Cmd+F) and search for: `mockup-slide__overlay`
4. You should see this line: `transform: translate(-50%, -50%) scale(var(--size-scale, 1.0));`
5. If you DON'T see that line → Re-upload the CSS file following Step 3 above
6. Close all browser tabs with 247printnetwork.com
7. Open fresh incognito window and test again

---

### **Issue: Artwork is barely visible or in wrong position**

**Most likely cause:** Browser cache showing old version

**Solution:**
1. Close **ALL** browser tabs with 247printnetwork.com open
2. Open **new incognito/private window**
3. Go to: https://247printnetwork.com/products/abandoned-factory-1
4. Press Ctrl+Shift+R (or Cmd+Shift+R) to hard refresh
5. Test size buttons again

---

### **Issue: Frames don't appear**

**Check these:**
- ✅ Is "Paper" finish selected? (Frames only work on Paper)
- ✅ Did you click a frame option? (Black/White/Walnut)
- ✅ Is the overlay visible? (Try clicking size buttons first)

**Solution:**
1. Select "Paper" finish
2. Click a size (e.g., "16x20")
3. Then click "Black Frame"
4. Frame should appear around the artwork

---

### **Issue: "9 errors" showing in Shopify theme editor**

**This is NORMAL!** These are just linter warnings about missing `width`/`height` attributes on `<img>` tags.

- ❌ They are NOT blocking errors
- ❌ They do NOT break the mockup system
- ✅ Your mockup overlay will work fine
- ✅ Safe to ignore

---

### **Issue: Changes not visible after upload**

**Solution:**
1. Verify both files show "Saved" in Shopify (green checkmark)
2. Close ALL tabs with 247printnetwork.com
3. Clear browser cache:
   - Chrome: Ctrl+Shift+Delete → Clear "Cached images and files"
   - Firefox: Ctrl+Shift+Delete → Clear "Cache"
4. Open **new incognito window**
5. Go to product page
6. Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

---

## 📊 **What the Fix Does**

### **Before (Broken):**
```javascript
// JavaScript sets the variable
overlay.style.setProperty('--size-scale', 0.64); // 8x10 size
```
```css
/* But CSS had NOTHING to use it! */
.mockup-slide__overlay {
  /* Missing transform rule - variable was ignored */
}
```
**Result:** Size buttons did nothing visually.

---

### **After (Fixed):**
```javascript
// JavaScript sets the variable (same as before)
overlay.style.setProperty('--size-scale', 0.64);
```
```css
/* NOW CSS actually applies the scaling! */
.mockup-slide__overlay {
  transform: translate(-50%, -50%) scale(var(--size-scale, 1.0));
  transition: transform 0.3s ease;
}
```
**Result:** Size buttons smoothly resize artwork!

---

## 🎨 **CSS Added to 247-art.css**

```css
/* ===== MOCKUP OVERLAY SYSTEM ===== */
.mockup-slide__container {
  position: relative;  /* Positioning context for overlay */
  width: 100%;
  height: 100%;
}

.mockup-slide__background {
  display: block;  /* Prevent inline spacing issues */
  width: 100%;
  height: 100%;
  object-fit: contain;  /* Maintain aspect ratio */
}

.mockup-slide__overlay {
  position: absolute;  /* Position within container */
  transform-origin: center center;  /* Scale from center */
  transform: translate(-50%, -50%) scale(var(--size-scale, 1.0));  /* THE FIX! */
  pointer-events: none;  /* Don't block clicks */
  transition: transform 0.3s ease, left 0.3s ease, top 0.3s ease, width 0.3s ease;  /* Smooth animations */
}

.mockup-slide__artwork {
  display: block;  /* Prevent collapsed height */
  width: 100%;
  height: auto;  /* Maintain aspect ratio */
}

.mockup-slide__frame {
  position: absolute;
  top: -4%;
  left: -4%;
  width: 108%;
  height: 108%;
  pointer-events: none;
  opacity: 0;  /* Hidden by default */
  transition: opacity 0.3s ease;
}

/* Frame color styles */
.mockup-slide__frame[data-frame="black"] {
  opacity: 1;
  background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.1), 0 4px 12px rgba(0, 0, 0, 0.3);
}

.mockup-slide__frame[data-frame="white"] {
  opacity: 1;
  background: linear-gradient(135deg, #ffffff 0%, #f5f5f5 100%);
  box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.05), 0 4px 12px rgba(0, 0, 0, 0.15);
}

.mockup-slide__frame[data-frame="walnut"] {
  opacity: 1;
  background: linear-gradient(135deg, #4a3228 0%, #6b4f3a 100%);
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.05), 0 4px 12px rgba(0, 0, 0, 0.25);
}
```

---

## 📝 **Summary**

**What you're uploading:**
1. ✅ `247-art.css` - Adds missing mockup overlay transform CSS
2. ✅ `247-art-product.liquid` - Updates mockup width from 1000px → 850px

**What will work after upload:**
- ✅ Size buttons resize artwork smoothly
- ✅ Frame selector adds/removes frames
- ✅ Room thumbnails switch backgrounds while keeping artwork
- ✅ No horizontal scroll on 1440px+ screens

**Expected user experience:**
Users can now see artwork in different sizes and frames in realistic room mockups - just like Displate!

---

## 🚨 **IMPORTANT REMINDER**

You must upload **BOTH files** for the complete fix:
1. `247-art.css` (contains the critical transform CSS)
2. `247-art-product.liquid` (updates the width)

Uploading only one file will result in incomplete functionality!

---

**Need help?** If something doesn't work after following these steps, check the Troubleshooting section above or let me know exactly what's happening and I'll help debug! 🙂
