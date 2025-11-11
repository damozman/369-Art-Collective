/**
 * Product Type Configuration System
 * 
 * Defines mappings between product types and their Shopify templates,
 * tags, and other configuration. This supports future expansion to
 * apparel, accessories, and other POD product categories.
 */

export interface ProductTypeConfig {
  type: string;
  shopifyTemplate: string | null;
  shopifyProductType: string; // The "product_type" value sent to Shopify API
  tags: string[];
  description: string;
}

export const PRODUCT_TYPES: Record<string, ProductTypeConfig> = {
  art_print: {
    type: "art_print",
    shopifyTemplate: "art",
    shopifyProductType: "Art Print",
    tags: ["art-print", "wall-art", "print-on-demand"],
    description: "Art prints on paper and canvas",
  },
  apparel: {
    type: "apparel",
    shopifyTemplate: "apparel",
    shopifyProductType: "Apparel",
    tags: ["apparel", "clothing", "print-on-demand"],
    description: "Printed apparel (t-shirts, hoodies, etc.)",
  },
  accessories: {
    type: "accessories",
    shopifyTemplate: "accessories",
    shopifyProductType: "Accessories",
    tags: ["accessories", "home-decor", "print-on-demand"],
    description: "Accessories and home decor (mugs, phone cases, etc.)",
  },
};

/**
 * Get product type configuration
 */
export function getProductTypeConfig(productType: string): ProductTypeConfig {
  const config = PRODUCT_TYPES[productType];
  if (!config) {
    throw new Error(`Unknown product type: ${productType}`);
  }
  return config;
}

/**
 * Get Shopify template suffix for a product type
 */
export function getShopifyTemplate(productType: string): string | null {
  return getProductTypeConfig(productType).shopifyTemplate;
}

/**
 * Get Shopify product_type value for a product type
 */
export function getShopifyProductType(productType: string): string {
  return getProductTypeConfig(productType).shopifyProductType;
}

/**
 * Get tags for a product type
 */
export function getProductTypeTags(productType: string): string[] {
  return getProductTypeConfig(productType).tags;
}

/**
 * Check if a product type is valid
 */
export function isValidProductType(productType: string): boolean {
  return productType in PRODUCT_TYPES;
}

/**
 * Get all available product types
 */
export function getAllProductTypes(): ProductTypeConfig[] {
  return Object.values(PRODUCT_TYPES);
}
