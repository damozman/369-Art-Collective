# Shopify Store Population Scripts

Complete workflow to populate your Shopify store with products and organize them into collections for testing and production.

## 📋 Complete Workflow

### Step 0: Clean Up Old Data (Optional)
```bash
npx tsx server/scripts/cleanup-shopify.ts
```
Removes ALL existing collections and orphaned products from Shopify. Use this to start fresh!

### Step 1: Check Readiness
```bash
npx tsx server/scripts/check-shopify-readiness.ts
```
Verifies Shopify configuration and shows what will be created.

### Step 2: Create Missing Products  
```bash
npx tsx server/scripts/create-missing-shopify-products.ts
```
Creates Shopify products for all approved artworks that don't have them yet.

### Step 3: Organize Into Collections
```bash
npx tsx server/scripts/populate-shopify-collections.ts
```
Organizes all products into artist, style, and featured collections.

---

## What These Scripts Do

### create-missing-shopify-products.ts
Creates Shopify products for approved artworks that don't have product IDs yet.
- Bulk-creates products with full marketing content
- Updates database with Shopify product IDs
- Respects Shopify API rate limits
- Shows detailed progress and error reporting

### populate-shopify-collections.ts
Organizes products into comprehensive collection structure:

### 1. Artist Collections
- One collection per artist: "Art by [Artist Name]"
- Contains all approved artworks from that artist
- Includes artist bio in collection description

### 2. Style Collections
- Collections based on artwork style tags
- Examples: "Modern Art", "Nature Photography", "Abstract", "Minimalist"
- Auto-grouped from your artwork metadata

### 3. Featured Collections
- **New Arrivals**: Latest 20 artworks
- **All Art Prints**: Complete catalog

## Prerequisites

You need these environment variables set:

```bash
SHOPIFY_SHOP_URL=your-store.myshopify.com
SHOPIFY_ACCESS_TOKEN=your_admin_api_access_token
```

## Quick Start (All-in-One)

Run all three scripts in sequence:

```bash
# 1. Check readiness
npx tsx server/scripts/check-shopify-readiness.ts

# 2. Create missing products (if needed)
npx tsx server/scripts/create-missing-shopify-products.ts

# 3. Organize into collections
npx tsx server/scripts/populate-shopify-collections.ts
```

## What Gets Created

Based on your current test data (56 approved artworks from 8 artists):

**Artist Collections (8):**
- Art by Sarah Chen
- Art by Marcus Rodriguez
- Art by Yuki Tanaka
- Art by Elena Kowalski
- Art by Nina Volkov
- Art by Raj Patel
- Art by Liam Anderson
- Art by Amara Johnson

**Style Collections (varies by your artwork tags):**
- Nature Photography
- Landscape
- Abstract
- Modern
- Minimalist
- Portrait
- Wildlife
- Architecture
- (and more based on your artwork style tags)

**Featured Collections (2):**
- New Arrivals
- All Art Prints

## Script Behavior

- ✅ **Idempotent**: Safe to run multiple times - checks for existing collections
- ⏱️ **Rate Limited**: Respects Shopify API limits (2 requests/second)
- 📊 **Progress Tracking**: Shows detailed progress as collections are created
- 🔄 **Auto-Skip**: Skips existing collections, only adds new ones
- 🎯 **Smart Organization**: Only includes artworks with Shopify product IDs

## Sample Output

```
🎨 Starting Shopify Collection Population Script
============================================================

📊 Found 56 approved artworks
   56 have Shopify product IDs
   0 need products created

📁 Found 0 existing collections in Shopify

============================================================
🎨 CREATING ARTIST COLLECTIONS
============================================================

✅ Created collection: Art by Sarah Chen (ID: 123456789)
   Added 15/15 products to collection

✅ Created collection: Art by Marcus Rodriguez (ID: 123456790)
   Added 12/12 products to collection

...

============================================================
✅ COLLECTION POPULATION COMPLETE
============================================================

📊 Summary:
   Artist Collections: 8
   Style Collections: 12
   Featured Collections: 2
   Total Collections Created: 22
   Products Organized: 56

🎨 Your Shopify store is now fully organized!

Visit your store: https://your-store.myshopify.com
```

## Dry Run Mode

If Shopify credentials aren't configured, the script runs in **dry-run mode** showing what would be created without making API calls. Great for testing!

## After Running

Visit your Shopify admin to see:
- All products organized into collections
- Collections visible in your storefront navigation
- Easy browsing by artist, style, or featured categories

## Troubleshooting

**"No artworks with Shopify product IDs found"**
- Run the artwork approval workflow first
- Approve some artworks to trigger Shopify product creation

**Shopify API errors**
- Check your SHOPIFY_ACCESS_TOKEN has correct permissions
- Ensure SHOPIFY_SHOP_URL format: `your-store.myshopify.com`
- Admin API access token needs `write_products` and `write_collections` scopes

**Rate limiting**
- Script automatically handles rate limits with 500ms delays
- Large catalogs may take several minutes to complete

## Next Steps

After running this script:
1. Visit your Shopify admin → Products → Collections
2. Verify all collections were created
3. Test your storefront navigation
4. Customize collection order/visibility in Shopify settings
5. Add collection images for better presentation
