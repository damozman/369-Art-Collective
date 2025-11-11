# Product Type System Guide

## Overview
The 247 Print Network now features an automatic template assignment system that prepares the platform for expansion beyond art prints to other POD product categories (apparel, accessories, etc.).

## How It Works

### Automatic Template Assignment
When artwork is approved by an admin:
1. The system checks the artwork's `productType` field (defaults to "art_print")
2. Looks up the corresponding Shopify template in the product type configuration
3. Automatically assigns the template when creating the Shopify product
4. Adds appropriate product type tags for filtering

### Current Configuration

**Art Prints** (default):
- Product Type: `art_print`
- Shopify Template: `art`
- Tags: `art-print`, `wall-art`, `print-on-demand`
- Description: Art prints on paper and canvas

### Future Product Types (Ready to Use)

**Apparel**:
- Product Type: `apparel`
- Shopify Template: `apparel`
- Tags: `apparel`, `clothing`, `print-on-demand`
- Description: Printed apparel (t-shirts, hoodies, etc.)

**Accessories**:
- Product Type: `accessories`
- Shopify Template: `accessories`
- Tags: `accessories`, `home-decor`, `print-on-demand`
- Description: Accessories and home decor (mugs, phone cases, etc.)

## Database Schema

### New Fields on `artworks` Table:
- `productType` (text, default: "art_print") - The category of POD product
- `shopifyTemplate` (text, nullable) - The Shopify template suffix assigned to the product

## Architecture

### Files Involved:
1. **`server/lib/product-types.ts`** - Product type configuration and mapping system
2. **`shared/schema.ts`** - Database schema with new fields
3. **`server/lib/shopify.ts`** - Updated product creation to use templates
4. **`server/routes.ts`** - Artwork approval route updated to pass product type

### Key Functions:
- `getProductTypeConfig(productType)` - Get full configuration for a product type
- `getShopifyTemplate(productType)` - Get template suffix for a product type
- `getProductTypeTags(productType)` - Get tags for a product type
- `isValidProductType(productType)` - Validate product type
- `getAllProductTypes()` - List all available product types

## Expanding to New Product Types

When you're ready to add new POD products:

### Step 1: Create Shopify Template (Optional)
If you want a custom template for the product type:
1. Create `product.{type}.liquid` in your Shopify theme
2. Add custom UI elements (size selectors, color options, etc.)
3. Deploy via `npm run shopify:deploy`

### Step 2: Add to Configuration
Edit `server/lib/product-types.ts` and add your new type:

```typescript
export const PRODUCT_TYPES: Record<string, ProductTypeConfig> = {
  // ... existing types ...
  
  my_new_type: {
    type: "my_new_type",
    shopifyTemplate: "my_template", // or null for default
    tags: ["my-tag", "custom-tag"],
    description: "Description of this product type",
  },
};
```

### Step 3: Upload Workflow
When artists upload artwork:
- They select the product type during upload (UI update needed)
- Or admin can set/change the product type before approval (admin UI update needed)

### Step 4: That's It!
The system will automatically:
- Assign the correct template when creating Shopify products
- Add the appropriate tags
- Track the product type in the database

## Current Behavior

**For all existing and new art uploads:**
- Default product type: `art_print`
- Automatic template: `art`
- Tags include: `art-print`, `wall-art`, `print-on-demand`

**No manual template assignment needed** - It happens automatically when artwork is approved.

## Benefits

1. **Zero Manual Work**: Admins don't need to manually assign templates
2. **Consistent Tagging**: Product types automatically get proper tags
3. **Future-Ready**: Easy to add new product categories
4. **Flexible**: Can use default Shopify template or custom templates per type
5. **Database Tracked**: Product type is stored for analytics and filtering

## Testing

To verify automatic template assignment:
1. Approve an artwork in the admin dashboard
2. Check Shopify Admin → Products
3. Verify the product uses the "art" template
4. Verify tags include "art-print", "wall-art", "print-on-demand"

## Notes

- All existing artworks default to `art_print` type
- The system is backward-compatible with existing products
- Product types can be extended without database migrations
- Template assignment happens during product creation, not post-hoc
