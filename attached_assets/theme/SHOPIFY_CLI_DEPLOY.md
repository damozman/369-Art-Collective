# 🚀 Shopify CLI Deployment Guide

## One-Command Deployment (Instead of Manual Upload)

Instead of manually uploading 11 files through Shopify Admin, you can deploy everything at once with Shopify CLI!

---

## ✅ **What's Ready**

Your theme is already organized in proper Shopify structure:
- ✅ **11 mockup files** (8 images + 3 code files)
- ✅ **All sections** (product pages, homepage, etc.)
- ✅ **All snippets** (configurator, line items, etc.)
- ✅ **All templates** (product, collection, etc.)
- ✅ **.shopifyignore** configured to skip documentation files

---

## 🎯 **Quick Start (2 Options)**

### **Option A: Use the Automated Script** ⭐ **EASIEST**

1. **Open Replit Shell** (bottom panel)

2. **Run the deployment script:**
   ```bash
   ./scripts/shopify-deploy.sh
   ```

3. **Choose option 1** (Create new unpublished theme for testing)
   - This is SAFE - won't touch your live site
   - Creates a new test theme you can preview

4. **Authenticate when prompted:**
   - Browser window will open
   - Login to your Shopify store
   - Approve the CLI connection

5. **Wait for upload:**
   - All files upload automatically
   - Takes 30-60 seconds
   - You'll get a preview URL when done!

---

### **Option B: Manual CLI Commands**

If you prefer to run commands directly:

#### **Step 1: Navigate to theme folder**
```bash
cd attached_assets/theme
```

#### **Step 2: Choose deployment type**

**For SAFE testing (recommended):**
```bash
shopify theme push --unpublished --store=bvhpq0-hy.myshopify.com
```

**To update an existing theme:**
```bash
# First, list your themes
shopify theme list --store=bvhpq0-hy.myshopify.com

# Then push to specific theme ID
shopify theme push --theme=THEME_ID --store=bvhpq0-hy.myshopify.com
```

**To push to your LIVE theme (careful!):**
```bash
shopify theme push --live --store=bvhpq0-hy.myshopify.com
```

---

## 🔐 **Authentication**

The first time you run a Shopify CLI command, you'll need to authenticate:

1. **CLI opens browser automatically**
2. **Login to Shopify** (if not already logged in)
3. **Click "Allow" to grant CLI access**
4. **Return to terminal** - deployment continues automatically

**Your credentials are never stored in code!** Authentication happens through Shopify's secure OAuth flow.

---

## ✅ **What Gets Deployed**

Running `shopify theme push` uploads:

**Assets (8 mockup images + 2 code files):**
- ✅ `247-art.css` (1,487 lines)
- ✅ `247-art.js` (756 lines)
- ✅ `mockup-living.png`, `mockup-bedroom.png`, `mockup-office.png`, `mockup-gallery.png`
- ✅ `mockup-living-thumb.png`, `mockup-bedroom-thumb.png`, `mockup-office-thumb.png`, `mockup-gallery-thumb.png`

**Sections (product page template):**
- ✅ `247-art-product.liquid` (complete template with mockup system)
- ✅ All other sections (homepage, collections, etc.)

**Snippets:**
- ✅ `247-art-options.liquid` (configurator buttons)
- ✅ `247-art-lineitem-properties.liquid`
- ✅ `247-merch-upsell.liquid`

**Templates:**
- ✅ `product.art.json` (product page layout)
- ✅ All other templates

**Config:**
- ✅ `settings_schema.json`
- ❌ `settings_data.json` (SKIPPED - preserves your store settings)

---

## 🧪 **After Deployment**

### **Option 1 (--unpublished): You Created a Test Theme**

After deployment completes, you'll see:
```
✅ Theme uploaded successfully!
   Preview URL: https://bvhpq0-hy.myshopify.com?preview_theme_id=123456789
```

**Next steps:**
1. **Click the preview URL** to test your changes
2. **Verify mockup system works:**
   - Size buttons resize artwork
   - Frame selector shows/hides frames
   - Room thumbnails switch backgrounds
3. **If everything works**, publish this theme from Shopify Admin

### **Option 2 (--theme=ID): You Updated Existing Theme**

The theme updates immediately! Test it:
1. Go to your product page in incognito window
2. Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
3. Verify all features work

---

## 🔄 **Future Updates**

After this initial setup, updating your theme is **super easy**:

```bash
cd attached_assets/theme
shopify theme push --theme=YOUR_THEME_ID
```

**That's it!** No more manual file uploads.

---

## ❌ **Troubleshooting**

### **Issue: "Shopify CLI not found"**

Install it:
```bash
npm install -g @shopify/cli @shopify/theme
```

### **Issue: "Authentication failed"**

Make sure you're the store owner or have "Themes" permission in Shopify.

### **Issue: "Can't connect to store"**

Verify your store URL:
```bash
shopify theme list --store=bvhpq0-hy.myshopify.com
```

### **Issue: "Theme push failed"**

Check for Liquid errors:
```bash
shopify theme check
```

---

## 📊 **Comparison: Manual vs CLI**

| Task | Manual Upload | Shopify CLI |
|------|--------------|-------------|
| Upload 11 files | 15-20 minutes | 30 seconds |
| Risk of mistakes | High (copy/paste errors) | Low (automated) |
| Future updates | Repeat all steps | One command |
| Version control | Manual tracking | Built-in |
| Testing | Must test on live theme | Create test themes |

---

## 🎯 **Next Step: GitHub Auto-Sync**

After you've successfully deployed with CLI once, the next step is setting up **GitHub integration** so future updates deploy automatically when you push code!

See `GITHUB_INTEGRATION.md` for setup instructions.

---

## 📞 **Need Help?**

If you run into issues:
1. Check the error message in terminal
2. Verify you're logged in to Shopify
3. Confirm your store URL is correct
4. Try running `shopify theme check` to diagnose problems

**Ready to deploy?** Run `./scripts/shopify-deploy.sh` now! 🚀
