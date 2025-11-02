
# 247PN Shopify Kit (Server + Theme)

## What this gives you
- **Server** (`/server`): an Express API with `/api/admin/approve` that reads config and creates a Shopify Draft product with Size × Finish variants (Paper/Canvas now).
- **Config** (`/config`): edit prices, finishes, sizes, providers without redeploying.
- **Theme** (`/theme`): OS2.0 section + snippets that add Digital vs Physical selection, Finish/Size radios, simple framing options, and a merch upsell.
- **Docs** (`/docs`): metafields GraphQL example.

## Quick Start (Replit or local)
1. Copy `.env.example` to `.env` and set `SHOPIFY_STORE_URL` & `SHOPIFY_ACCESS_TOKEN`.
2. `cd server && npm install && npm run dev`
3. POST a test approve:
   ```json
   POST /api/admin/approve
   {
     "artistName": "Judy Hull",
     "artistShort": "JH",
     "artworkId": "001",
     "title": "Sunset Over Water",
     "imageUrl": "https://placehold.co/1200x1200.png"
   }
   ```
4. Check Shopify admin → Products (Draft).

## Theme install
- Upload files from `/theme` into your Shopify theme:
  - `sections/247-art-product.liquid`
  - `snippets/247-art-options.liquid`
  - `snippets/247-art-lineitem-properties.liquid`
  - `snippets/247-merch-upsell.liquid`
  - `assets/247-art.js`
- Create a new Product template and include the **247 Art Product** section.
- Assign this template to your art products.

## Notes
- Digital downloads: this kit shows the option at UI level. Use Shopify's **Digital Downloads** app (free) or another app to attach files post-purchase.
- Framing: the example uses **line item properties**. You can convert frames to real variants later (per finish/size) if desired.
- Metal is pre-configured in config but OFF by default. Flip `providers.printify.enabled` and route `per_finish.Metal` when you're ready.
