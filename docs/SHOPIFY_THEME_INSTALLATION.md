# Shopify Theme Installation Guide
## 369 Art Collective Art Products Enhancement

This guide will help you install custom theme files to enhance how your art products appear on your Shopify storefront at **369artcollective.com**.

---

## 📦 What's Included

Your theme enhancement includes 5 files that work together to create a premium art product shopping experience:

### **Sections** (Main Product Layout)
- `sections/247-art-product.liquid` - Complete art product page layout

### **Snippets** (Reusable Components)
- `snippets/247-art-options.liquid` - Size/Finish/Format/Frame selectors
- `snippets/247-art-lineitem-properties.liquid` - Cart line item properties
- `snippets/247-merch-upsell.liquid` - Merchandise upsell suggestions

### **Assets** (JavaScript)
- `assets/247-art.js` - Interactive variant selection logic

---

## 🎯 What This Does For Your Store

When installed, customers viewing approved artwork will see:

✅ **Format Selector**: Digital Download vs Physical Print (UI toggle only)
✅ **Size Options**: 8x10, 12x16, 18x24, 24x36
✅ **Finish Chooser**: Paper, Canvas, Metal
✅ **Frame Add-On**: No Frame, Black Classic, White Classic, Natural Wood
✅ **Variant Matching**: Automatically selects correct Shopify variant based on size/finish
✅ **Line Item Properties**: Custom properties saved to cart (size, finish, frame, format)

**Note**: This is a basic implementation that provides the selection UI and variant matching. For automatic price display updates, you'll need to integrate with your Shopify theme's product price rendering (see Customization section).

---

## 📋 Prerequisites

Before you begin, make sure you have:
- Admin access to your Shopify store (bvhpq0-hy.myshopify.com)
- At least one approved artwork product created by the artist portal
- Basic familiarity with Shopify theme editor

---

## 🚀 Installation Instructions

### Step 1: Access Your Theme Editor

1. Log in to your **Shopify Admin**
2. Go to **Online Store** → **Themes**
3. Find your current theme (usually "Dawn" or your active theme)
4. Click **Actions** → **Edit code**

### Step 2: Upload Section File

1. In the left sidebar, find the **Sections** folder
2. Click **Add a new section**
3. Name it: `247-art-product`
4. Replace all content with the contents of `attached_assets/theme/sections/247-art-product.liquid`
5. Click **Save**

### Step 3: Upload Snippet Files

For **each** of the following files, repeat these steps:

1. In the left sidebar, find the **Snippets** folder
2. Click **Add a new snippet**
3. Name it exactly as shown below:
   - `247-art-options`
   - `247-art-lineitem-properties`
   - `247-merch-upsell`
4. Copy the contents from the corresponding file in `attached_assets/theme/snippets/`
5. Click **Save**

### Step 4: Upload JavaScript Asset

1. In the left sidebar, find the **Assets** folder
2. Click **Add a new asset**
3. Choose **Create a blank file**
4. Name it: `247-art.js`
5. Copy the contents from `attached_assets/theme/assets/247-art.js`
6. Click **Save**

### Step 5: Create Custom Product Template

Now we need to tell Shopify to use this new section for art products:

1. In the left sidebar, find the **Templates** folder
2. Click **Add a new template**
3. Choose template type: **product**
4. Name it: `product.art` (this creates a template called "art")
5. You'll see JSON code. Replace it with:

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

6. Click **Save**

### Step 6: Assign Template to Art Products

1. Go back to Shopify Admin → **Products**
2. Find your art products (created when you approve artwork)
3. Click on a product to edit it
4. Scroll down to the **Theme templates** section on the right sidebar
5. Under **Template**, change from "Default product" to **art**
6. Click **Save**
7. Repeat for all art products

---

## 🎨 How It Works

### Variant Matching System

The JavaScript automatically:
1. Listens for size/finish selection changes
2. Finds the matching Shopify variant (e.g., "12x16 - Canvas")
3. Updates the hidden variant ID field so correct variant is added to cart

**Important**: The script updates which variant will be added to cart, but does NOT update the displayed price on the page. Price display updates require integration with your theme's price rendering system (see "Adding Price Updates" in Customization section below).

### Digital vs Physical Toggle

When customer selects "Digital Download":
- Size/Finish/Frame options hide
- Shows digital download description
- Line item property "Format: Digital" is set

When customer selects "Physical Print":
- Shows all physical options
- Line item property "Format: Physical" is set
- Selected size/finish determines which variant is added to cart

**Note**: Digital downloads currently use the same Shopify variants as physical prints. To implement separate digital pricing, you'll need to create digital-only variants or products (see Customization section).

### Cart Line Properties

Custom properties are added to cart items:
- **Format**: Digital or Physical
- **Finish**: Paper, Canvas, or Metal (physical only)
- **Size**: 8x10, 12x16, 18x24, 24x36 (physical only)
- **Frame**: Selected frame option (physical only)

These appear in:
- Shopping cart
- Checkout
- Order confirmation
- Admin order details

---

## ✅ Testing Checklist

After installation, test the following:

### Basic Functionality
- [ ] Navigate to an art product page
- [ ] Verify size selector shows: 8x10, 12x16, 18x24, 24x36
- [ ] Verify finish selector shows: Paper, Canvas, Metal
- [ ] Click different sizes → variant ID updates (check browser console)
- [ ] Click different finishes → variant ID updates (check browser console)

### Digital Download
- [ ] Select "Digital Download" radio button
- [ ] Size/Finish/Frame options disappear
- [ ] Digital download message appears
- [ ] Format property will be set to "Digital" in cart

### Physical Print
- [ ] Select "Physical Print" radio button
- [ ] Size/Finish/Frame options reappear
- [ ] Default selections are checked

### Add to Cart
- [ ] Select: 12x16, Canvas, Black Classic frame
- [ ] Click "Add to cart"
- [ ] Open cart → verify line item shows:
  - Format: Physical
  - Size: 12x16
  - Finish: Canvas
  - Frame: Black Classic
- [ ] Price matches expected total

### Variant Matching
- [ ] Change size to 18x24
- [ ] Change finish to Paper
- [ ] Add to cart
- [ ] Check cart → correct variant SKU shows (ART-XX-XXX-18x24-Paper)

---

## 🐛 Troubleshooting

### "Add to cart" doesn't work
**Problem**: Wrong variant ID being sent
**Solution**: Check browser console for errors. Verify product has variants matching your sizes/finishes.

### Price doesn't update when changing options
**This is expected behavior** - The current implementation only updates the variant ID, not the displayed price. To add price updates:
1. See "Adding Price Updates" in the Customization section
2. Integrate with your theme's product price rendering
3. Or use Shopify's built-in variant selector components

### Options don't appear on product page
**Problem**: Template not assigned
**Solution**: Go to product → Theme templates → Select "art" template

### Digital toggle doesn't hide/show fields
**Problem**: JavaScript querySelector not finding elements
**Solution**: Verify snippet `247-art-options.liquid` has correct `data-physical-only` and `data-digital-only` attributes

### Frame options not appearing in cart
**Problem**: Line item properties not rendering
**Solution**: Verify `247-art-lineitem-properties.liquid` snippet exists and is called from the section

---

## 🔧 Customization Options

### Adding Price Updates (Advanced)

The basic implementation doesn't update the displayed price when customers change size/finish. To add this functionality:

**Option 1: Add Price Display Logic to JavaScript**

Edit `assets/247-art.js` and add after the `findVariantId` function:

```javascript
function updatePriceDisplay() {
  const size = sizeSelect?.value;
  const finish = Array.from(finishRadios).find(r => r.checked)?.value;
  const variants = window?.ShopifyAnalytics?.meta?.product?.variants || [];
  const found = variants.find(v => v.name?.includes(size) && v.name?.includes(finish));
  
  if (found) {
    // Update price display - adjust selector to match your theme
    const priceElement = document.querySelector('.product__price .price-item--regular');
    if (priceElement && found.price) {
      priceElement.textContent = '$' + (found.price / 100).toFixed(2);
    }
  }
}

// Call on selection changes
sizeSelect?.addEventListener('change', () => {
  findVariantId();
  updatePriceDisplay();
});
finishRadios.forEach(r => r.addEventListener('change', () => {
  findVariantId();
  updatePriceDisplay();
}));
```

**Option 2: Use Shopify's Built-in Variant Selector**

Instead of custom selectors, use Shopify's `<variant-selects>` component which handles pricing automatically. See [Shopify theme docs](https://shopify.dev/docs/themes/architecture/sections/product-template).

**Option 3: Modify Section to Include Price Block**

In `sections/247-art-product.liquid`, add price rendering that updates with variant changes. Consult your theme's documentation for the correct price rendering pattern (varies by theme).

### Adding Digital Download Pricing

To implement separate pricing for digital downloads:

**Method 1: Create Separate Digital Products**
- When approving artwork, create TWO Shopify products:
  - One for physical prints (with size/finish variants)
  - One for digital download (single variant)
- Link between them in the theme

**Method 2: Add Digital Variant**
- Modify `server/lib/shopify.ts` to add a 9th variant: "Digital Download"
- Price it separately in `config/pricing_matrix.json`
- Modify `247-art.js` to select digital variant when "Digital" format chosen

**Method 3: Use Line Item Properties**
- Keep current setup (digital uses physical variant)
- Handle pricing difference via Shopify Scripts or checkout customization
- Applies discount when "Format: Digital" property detected

### Adding More Frame Options

Edit `snippets/247-art-options.liquid`, find the Frame select dropdown, add more options:

```liquid
<select name="properties[Frame]">
  <option value="No Frame" selected>No Frame</option>
  <option value="Black Classic">Black Classic</option>
  <option value="White Classic">White Classic</option>
  <option value="Natural Wood">Natural Wood</option>
  <option value="Gallery Float">Gallery Float</option>  <!-- Add this -->
  <option value="Rustic Barn">Rustic Barn</option>      <!-- Or this -->
</select>
```

### Adding More Finishes

Edit `snippets/247-art-options.liquid`, find the finishes array:

```liquid
{% assign finishes = 'Paper,Canvas,Metal,Acrylic' | split: ',' %}
```

**Note**: You must also create matching variants in your Shopify products!

### Changing Default Selections

In `snippets/247-art-options.liquid`:
- Change `checked` attribute to set default format
- Change `{% if forloop.first %}checked{% endif %}` to different position for default finish
- Change first `<option>` in size select for default size

### Styling the Product Page

Add custom CSS to `assets/247-art.css` (create new file):

```css
.247pn-options {
  margin: 20px 0;
}

.247pn-options .field {
  margin-bottom: 15px;
}

.247pn-options label {
  font-weight: 600;
  display: block;
  margin-bottom: 8px;
}

.radios {
  display: flex;
  gap: 15px;
}
```

Then include in `sections/247-art-product.liquid`:

```liquid
{{ '247-art.css' | asset_url | stylesheet_tag }}
```

---

## 📊 Expected Product Structure

For this theme to work correctly, approved artwork products should have:

### Product Fields
- **Title**: Artwork title (e.g., "Ocean Waves")
- **Vendor**: Artist name (e.g., "Test Artist")
- **Product Type**: "Art Print"
- **Status**: Draft (you publish when ready)

### Variants (8 total)
Each artwork should have 8 variants created automatically:

| Size   | Finish | Price | SKU Example           |
|--------|--------|-------|-----------------------|
| 8x10   | Paper  | $19   | ART-TA-123-8x10-Paper |
| 12x16  | Paper  | $29   | ART-TA-123-12x16-Paper|
| 18x24  | Paper  | $49   | ART-TA-123-18x24-Paper|
| 24x36  | Paper  | $79   | ART-TA-123-24x36-Paper|
| 8x10   | Canvas | $39   | ART-TA-123-8x10-Canvas|
| 12x16  | Canvas | $59   | ART-TA-123-12x16-Canvas|
| 18x24  | Canvas | $99   | ART-TA-123-18x24-Canvas|
| 24x36  | Canvas | $159  | ART-TA-123-24x36-Canvas|

**Note**: The artist portal automatically creates these when you approve artwork!

### Metafields
- `artist_id`: Artist's UUID
- `artwork_id`: Artwork's UUID
- `provider`: Print provider name

---

## 🎓 Understanding the Code

### Section: 247-art-product.liquid

This is the main product page layout. It:
1. Renders the product image/media
2. Shows product title and artist name (vendor)
3. Includes the options snippet (size/finish selectors)
4. Creates the "Add to cart" form
5. Includes the upsell snippet
6. Loads the JavaScript

**Key Liquid Tags**:
- `{% render 'snippet-name', product: product %}` - Includes a snippet
- `{{ product.title }}` - Outputs product title
- `{{ '247-art.js' | asset_url }}` - Gets URL of JS file

### Snippet: 247-art-options.liquid

Creates all the interactive selectors:
- Format radio buttons (Digital/Physical)
- Finish radio buttons (Paper/Canvas/Metal)
- Size dropdown
- Frame dropdown

**Key Features**:
- `data-physical-only` - Elements that hide when Digital selected
- `data-digital-only` - Elements that show only for Digital
- `data-format="digital"` - JavaScript uses this to detect mode
- `name="properties[...]"` - Cart line item properties

### Snippet: 247-art-lineitem-properties.liquid

Defines which properties to store with cart items. These appear in:
- Cart display
- Checkout summary
- Order confirmation
- Admin order view

### Snippet: 247-merch-upsell.liquid

Shows related merchandise suggestions (frames, matting, etc.). 
You can customize this to cross-sell framing services or other products.

### Asset: 247-art.js

JavaScript that:
1. Listens for format changes (Digital/Physical)
2. Shows/hides relevant fields
3. Matches size + finish to find correct variant ID
4. Updates hidden variant input field
5. Price automatically updates via Shopify's built-in system

**Key Functions**:
- `setMode(mode)` - Toggles Digital/Physical display
- `findVariantId()` - Matches selections to Shopify variant
- Event listeners on all selectors

---

## 🔄 Updating Prices

Prices are controlled in your artist portal config files:
- `config/pricing_matrix.json` - Base prices per size/finish
- `config/provider_config.json` - Provider markup
- `config/weights_lb.json` - Shipping weight calculations

When you approve artwork, these prices are automatically:
1. Calculated by the portal backend
2. Pushed to Shopify variants
3. Displayed on the storefront

**To update prices**:
1. Edit the config files in your artist portal
2. Delete and re-approve the artwork (or update via Shopify API)
3. New prices will sync to Shopify

---

## 🚢 Publishing Products

After approval, products are in **Draft** status. To make them live:

1. Go to Shopify Admin → **Products**
2. Click on the artwork product
3. Verify all details look correct
4. Click **Publish** button (top right)
5. Choose sales channels: Online Store, Facebook Shop, etc.
6. Click **Publish**

Now customers can see and purchase it on 369artcollective.com!

---

## 📞 Support

If you encounter issues:

1. **Check browser console** (F12) for JavaScript errors
2. **Verify all 5 files are uploaded** to correct folders
3. **Confirm template is assigned** to art products
4. **Test with a fresh product** approved through the portal
5. **Clear browser cache** and test in incognito mode

---

## ✨ You're All Set!

Your Shopify storefront now has a professional art product shopping experience that:
- Matches perfectly with your artist portal
- Automatically handles variant selection
- Supports both digital and physical products
- Provides a clean, intuitive customer experience

Customers can now browse approved artwork, select their preferred size and finish, add framing options, and checkout seamlessly!

---

**Created for**: 369 Art Collective
**Store**: bvhpq0-hy.myshopify.com / 369artcollective.com
**Artist Portal**: Running on Replit
**Integration**: Fully automated artwork-to-storefront pipeline
