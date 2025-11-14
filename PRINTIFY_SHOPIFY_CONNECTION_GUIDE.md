# Printify → Shopify Connection Guide

## 🎯 What This Fixes
Connecting your Printify shop to Shopify enables **automatic mockup image sync**. Once connected:
- ✅ Printify mockups appear on your Shopify product pages automatically
- ✅ New products sync mockups without manual intervention  
- ✅ Your 50 existing products will get their 31 mockup images each

---

## 📋 Prerequisites

You need access to:
1. **Printify Dashboard**: https://printify.com/app/
2. **Shopify Admin**: https://bvhpq0-hy.myshopify.com/admin

---

## 🔗 Step-by-Step Connection Process

### Step 1: Log into Printify
1. Go to https://printify.com/app/
2. Log in with your Printify account
3. You should see your shop: **"My new store"** (ID: 25164625)

### Step 2: Connect to Shopify Sales Channel
1. In Printify dashboard, look for **"My Sales Channels"** in the left sidebar
2. Click **"Connect"** or **"Add Sales Channel"**
3. Select **"Shopify"** from the list of platforms
4. You'll be redirected to authorize the connection

### Step 3: Authorize Printify in Shopify
1. Shopify will ask you to authorize Printify to access your store
2. Review the permissions (Printify needs to read/write products and images)
3. Click **"Install app"** or **"Authorize"**
4. You'll be redirected back to Printify

### Step 4: Configure Sync Settings
In Printify, configure these settings:
- ✅ **Enable "Auto-publish products"** (recommended)
- ✅ **Enable "Sync product images"** (CRITICAL - this adds mockups!)
- ✅ **Enable "Update existing products"** (to sync your 50 existing products)

### Step 5: Publish Existing Products
Since you already have 50 products created in Printify:

**Option A: Bulk Publish (Fastest)**
1. In Printify → Go to "My Products"
2. Select all products (checkbox at top)
3. Click "Publish" → Select "Shopify" store
4. Click "Publish to Store"
5. **Wait 5-10 minutes** for mockup sync

**Option B: Individual Publish**
1. For each product, click the 3-dot menu
2. Select "Publish" → Choose Shopify
3. Confirm publication

---

## ⚡ What Happens After Connection

**Immediate:**
- Printify app appears in your Shopify admin
- Connection status shows "Connected"

**Within 10 minutes:**
- Mockup images start appearing on Shopify products
- Each product gets 3-4 mockup images added to its gallery
- Original artwork image remains as primary image

**Going Forward:**
- New products auto-sync mockups when approved in Replit
- No manual intervention needed

---

## ✅ Verification Steps

After connecting and publishing, verify the sync worked:

1. **Check a Product in Shopify Admin:**
   - Go to https://bvhpq0-hy.myshopify.com/admin/products/9875839156521
   - Scroll to "Media" section
   - You should see 4+ images (1 original + 3-4 mockups)

2. **Check Storefront:**
   - Visit https://247printnetwork.com/products/abandoned-factory-1
   - Product gallery should show multiple thumbnail images
   - Clicking thumbnails should switch the main image

3. **Test the Test Product:**
   - Check https://247printnetwork.com/products/test-abandoned-factory-unsplash
   - Should have 4+ images in gallery

---

## 🔧 Troubleshooting

### "Products not syncing"
- **Wait**: Initial sync can take 10-15 minutes for 50 products
- **Check settings**: Ensure "Sync product images" is enabled
- **Republish**: Try republishing one product manually

### "Mockups not appearing on storefront"
- **Clear cache**: Hard refresh browser (Ctrl+Shift+R)
- **Check Shopify admin**: Verify images exist in product media
- **Theme compatibility**: Ensure theme supports product image galleries

### "Connection failed"
- **Reinstall app**: Remove Printify from Shopify Apps, then reconnect
- **Check permissions**: Ensure you're admin in both Printify and Shopify

---

## 📊 Expected Results

**Before Connection:**
- Products on storefront: 1 image each (original artwork only)
- Example: https://247printnetwork.com/products/abandoned-factory-1

**After Connection:**
- Products on storefront: 4+ images each
- Main image: Original artwork
- Mockups: Room scenes showing artwork on walls

---

## 💡 Pro Tips

1. **Bulk Operations**: Use Printify's bulk actions to save time
2. **Auto-Publish**: Enable auto-publish for future products
3. **Image Order**: Printify adds mockups after your original image
4. **Product Updates**: Any changes in Printify auto-sync to Shopify

---

## 🚨 Important Notes

**About Existing Products:**
- Your 50 products already exist in Shopify
- Printify will UPDATE them (not create duplicates)
- Original images won't be replaced
- Mockups will be ADDED to existing galleries

**About Future Products:**
- When you approve artwork in Replit, it creates Printify + Shopify products
- With connection active, mockups auto-sync within minutes
- No manual intervention needed

---

## 📞 Need Help?

If you encounter issues:
1. Check Printify's integration logs in their dashboard
2. Review Shopify's app logs in Settings → Apps and sales channels
3. Contact Printify support with shop ID: **25164625**

---

## 🎉 Success Criteria

You'll know it's working when:
- ✅ Printify app shows "Connected" in Shopify admin
- ✅ Product pages have 4+ images in media gallery
- ✅ Storefront shows clickable thumbnail gallery
- ✅ Mockups display room scenes with artwork on walls

**Expected Timeline:** 15-30 minutes from connection to full sync
