# Shopify Theme Deployment Guide

## 369 Art Collective - Premium Displate-Inspired Theme

### Overview
This guide covers deploying the enhanced Shopify theme featuring:
- **Premium CSS styling** (Displate-inspired clean design)
- **Artist-centric product pages** with spotlight sections
- **Interactive selector UI** for size/finish/frame options
- **Modern layout** with elegant spacing and typography

### File Structure

```
attached_assets/theme/
├── assets/
│   └── 247-art.css           # Premium styling (NEW/UPDATED)
├── sections/
│   └── 247-art-product.liquid # Product page layout (NEW/UPDATED)
├── snippets/
│   ├── 247-art-options.liquid # Option selectors (NEW/UPDATED)
│   ├── 247-art-lineitem-properties.liquid
│   └── 247-merch-upsell.liquid
└── templates/
    └── product.art.liquid     # Art product template
```

### Deployment Command

```bash
npm run shopify:deploy
```

This command:
1. Authenticates with Shopify CLI
2. Uploads all 6 theme files automatically
3. Deploys to your configured Shopify store theme

### Key Features

#### 1. Premium CSS (247-art.css)
- **Two-column layout**: Sticky product images + scrollable product info
- **Artist spotlight**: Dedicated section with avatar placeholder and bio
- **Interactive selectors**: Hover effects, smooth transitions, selected states
- **Typography**: Clean hierarchy with modern font sizing
- **Trust badges**: Built-in sections for quality guarantees
- **Size guide**: Helpful table for customer decision-making
- **Responsive**: Mobile-optimized with breakpoints

#### 2. Enhanced Product Section
- **Sticky product images** for better browsing experience
- **Artist attribution** prominently displayed
- **Product details table** with material specs
- **Trust badges** for social proof (Artist Royalties, Fast Shipping, Quality)
- **Merchandise upsell** section for future apparel expansion

#### 3. Premium Option Selectors
- **Grid layout** for size/finish options (not dropdowns)
- **Visual feedback**: Selected states with black backgrounds
- **Descriptive labels**: Each option has subtitle text ("Perfect for desks", "Smooth matte", etc.)
- **Frame toggles**: Card-style selectors with pricing
- **Size guide table**: Embedded reference for customers

### Design Principles (Displate-Inspired)

✓ **Artist-First**: Prominent vendor attribution, spotlight sections
✓ **Clean Layout**: Generous white space, minimal clutter
✓ **Premium Feel**: Elegant typography, subtle shadows, smooth interactions
✓ **Product Focus**: Large images, sticky positioning, clear hierarchy
✓ **Trust Signals**: Quality badges, material details, artist royalties
✓ **Interactive**: Hover effects, clickable option cards, smooth transitions

### Verification Checklist

After deployment, verify:
- [ ] CSS file loads correctly (check browser DevTools)
- [ ] Product page uses two-column layout
- [ ] Artist spotlight section appears
- [ ] Option selectors are clickable cards (not dropdowns)
- [ ] Frame options display with pricing
- [ ] Size guide table shows correctly
- [ ] Trust badges render properly
- [ ] Mobile responsive layout works

### Future Enhancements

When expanding to apparel/accessories:
1. Update `247-art-options.liquid` to support different option types
2. Add product-type-specific selectors (size charts for apparel)
3. Extend CSS for varied product layouts
4. Product type system already handles automatic template assignment

### Troubleshooting

**CSS not loading?**
- Verify `{{ '247-art.css' | asset_url | stylesheet_tag }}` is in section file
- Check Shopify theme asset library for successful upload

**Options not working?**
- Inspect browser console for JavaScript errors
- Ensure snippets are rendering correctly

**Layout broken on mobile?**
- Check responsive breakpoints in CSS (`@media` queries)
- Test with Chrome DevTools device emulation

### Related Documentation
- `PRODUCT_TYPES_GUIDE.md` - Product type system architecture
- `scripts/deploy-shopify-theme.js` - Deployment automation
- `replit.md` - Platform overview and technical architecture
