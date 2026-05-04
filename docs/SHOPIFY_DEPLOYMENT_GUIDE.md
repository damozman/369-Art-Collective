# Shopify Theme Deployment Guide
## Automated Upload System for 369 Art Collective

This guide explains how to use the automated deployment system to upload your custom art product theme files to Shopify with a single command.

---

## 🎯 What This Does

Instead of manually copying 5 files into Shopify's theme editor, you can now:
- Run **one command** to deploy everything
- Auto-upload all theme files (sections, snippets, assets)
- Automatically assign the "art" template to products (optional)

---

## 📋 One-Time Setup (5 minutes)

### Step 1: Add NPM Scripts

Add these scripts to your `package.json` file in the `"scripts"` section:

```json
{
  "scripts": {
    "dev": "NODE_ENV=development tsx server/index.ts",
    "build": "vite build",
    "start": "NODE_ENV=production tsx server/index.ts",
    "db:push": "drizzle-kit push",
    "shopify:auth": "shopify auth login",
    "shopify:deploy": "node scripts/deploy-shopify-theme.js",
    "shopify:assign-templates": "node scripts/assign-art-template.js",
    "shopify:watch": "shopify theme dev"
  }
}
```

### Step 2: Authenticate with Shopify (One-Time)

Run this command and follow the prompts:

```bash
npm run shopify:auth
```

This will:
1. Open your browser
2. Ask you to log in to Shopify
3. Select your store: `369artcollective.com` (or your Shopify store)
4. Save credentials locally

**You only need to do this once per machine.**

---

## 🚀 Deploying Theme Files

### Quick Deploy (Recommended)

Deploy all theme files with one command:

```bash
npm run shopify:deploy
```

This uploads:
- ✅ `sections/247-art-product.liquid` - Main product page layout
- ✅ `snippets/247-art-options.liquid` - Size/finish/format selectors
- ✅ `snippets/247-art-lineitem-properties.liquid` - Cart properties
- ✅ `snippets/247-merch-upsell.liquid` - Upsell component
- ✅ `assets/247-art.js` - Interactive variant logic

### What Happens

The deployment script will:

1. ✅ Verify all 5 theme files exist locally
2. ✅ Check you're authenticated with Shopify
3. ✅ Upload files to your live theme
4. ✅ Show success confirmation

**Time: ~30-60 seconds**

---

## 🎨 Creating the Product Template

After deployment, you need to create a custom product template **once**:

### Option A: Manual Creation (Shopify Admin)

1. Go to **Shopify Admin** → **Online Store** → **Themes**
2. Click **Actions** → **Edit code**
3. In the **Templates** folder, click **Add a new template**
4. Choose template type: **product**
5. Name it: `product.art`
6. Replace the JSON with:

```json
{
  "sections": {
    "main": {
      "type": "247-art-product",
      "settings": {}
    },
    "related-products": {
      "type": "related-products",
      "settings": {}
    }
  },
  "order": [
    "main",
    "related-products"
  ]
}
```

7. Click **Save**

### Option B: Via Shopify CLI (Advanced)

```bash
shopify theme push --only templates/product.art.json
```

---

## 🏷️ Assigning Template to Products

You have two options:

### Option A: Manual Assignment (Shopify Admin)

For each art product:

1. Go to **Products** in Shopify Admin
2. Click on an art product
3. Scroll to **Theme templates** (right sidebar)
4. Change template from "Default product" to **art**
5. Click **Save**

### Option B: Automated Assignment (Recommended)

Use the automated script to assign the template to all art products at once.

#### Setup (One-Time)

1. Create a Shopify Admin API token:
   - Go to **Shopify Admin** → **Settings** → **Apps and sales channels**
   - Click **Develop apps**
   - Click **Create an app** (name it "Theme Manager")
   - Click **Configure Admin API scopes**
   - Enable: `read_products`, `write_products`
   - Click **Install app**
   - Copy the **Admin API access token**

2. Add to your `.env` file:

```bash
SHOPIFY_ADMIN_API_TOKEN=shpat_xxxxxxxxxxxxxxxxxxxxx
SHOPIFY_STORE_URL=bvhpq0-hy.myshopify.com
```

#### Run Assignment

```bash
npm run shopify:assign-templates
```

This will:
- Find all products with vendor "369 Art Collective" or tags "artwork"/"art-print"
- Assign the "art" template to each one
- Show progress and summary

---

## 🔄 Development Workflow

### Live Theme Preview

While developing theme customizations, use:

```bash
npm run shopify:watch
```

This creates a live preview URL where you can:
- See changes instantly (no deploy needed)
- Test on your actual products
- Preview before pushing to live theme

---

## 📁 Files Explained

### Deployment Scripts

- **`scripts/deploy-shopify-theme.js`** - Main deployment automation
- **`scripts/assign-art-template.js`** - Auto-assign templates to products

### Theme Files (in `attached_assets/theme/`)

```
attached_assets/theme/
├── sections/
│   └── 247-art-product.liquid    (Main product page layout)
├── snippets/
│   ├── 247-art-options.liquid     (Size/finish/format selectors)
│   ├── 247-art-lineitem-properties.liquid  (Cart properties)
│   └── 247-merch-upsell.liquid    (Upsell component)
└── assets/
    └── 247-art.js                 (Interactive variant logic)
```

---

## 🛠️ Troubleshooting

### "Not authenticated with Shopify"

**Fix:** Run `npm run shopify:auth` and log in

### "File not found" error

**Fix:** Make sure you're in the project root directory

### Deployment succeeds but changes don't appear

**Possible causes:**
1. Wrong theme selected - make sure you deployed to the correct theme
2. Product still using "Default product" template - assign the "art" template
3. Cache issue - hard refresh your browser (Cmd+Shift+R or Ctrl+Shift+R)

### "Template assignment failed"

**Check:**
1. `SHOPIFY_ADMIN_API_TOKEN` is set correctly in `.env`
2. API token has `write_products` permission
3. `SHOPIFY_STORE_URL` matches your store exactly

### Products aren't being auto-assigned

The script filters products by:
- Vendor = "369 Art Collective" OR
- Tags include "artwork" or "art-print"

**Fix:** Make sure your art products meet these criteria, or edit `scripts/assign-art-template.js` to adjust the filter.

---

## 🎓 Common Commands

```bash
# Authentication
npm run shopify:auth                    # Log in to Shopify (one-time)

# Deployment
npm run shopify:deploy                  # Deploy all theme files

# Template Assignment
npm run shopify:assign-templates        # Auto-assign "art" template to products

# Development
npm run shopify:watch                   # Live preview with hot reload
```

---

## 🔐 Security Notes

### API Tokens

- **Never commit** your `.env` file to version control
- Admin API tokens have full access - keep them secret
- Rotate tokens if compromised

### Theme Access

- The Shopify CLI uses OAuth - no passwords needed
- Tokens are stored in `~/.config/shopify/`
- Revoke access in Shopify Partners if needed

---

## 📚 Additional Resources

- [Shopify Theme Documentation](https://shopify.dev/docs/themes)
- [Shopify CLI Reference](https://shopify.dev/docs/themes/tools/cli)
- [Liquid Template Language](https://shopify.dev/docs/api/liquid)
- [Admin API Reference](https://shopify.dev/docs/api/admin-rest)

---

## 🆘 Need Help?

If you encounter issues:

1. Check the troubleshooting section above
2. Verify you're authenticated: `shopify auth status`
3. Ensure all files exist in `attached_assets/theme/`
4. Check Shopify CLI version: `shopify version` (should be 3.x)

For manual installation (without CLI), see: `SHOPIFY_THEME_INSTALLATION.md`

---

## ✅ Quick Start Checklist

- [ ] Add npm scripts to `package.json`
- [ ] Run `npm run shopify:auth` (one-time)
- [ ] Run `npm run shopify:deploy` (deploys theme files)
- [ ] Create `product.art` template in Shopify theme editor
- [ ] (Optional) Set up Admin API token in `.env`
- [ ] (Optional) Run `npm run shopify:assign-templates`
- [ ] Test on a product to verify everything works

**Estimated time: 10 minutes total**

---

🎉 **You're done!** Your art products now have beautiful custom product pages.
