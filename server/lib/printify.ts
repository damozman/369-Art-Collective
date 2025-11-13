/**
 * Printify API Client
 * Handles all interactions with Printify for POD fulfillment
 */

const PRINTIFY_API_TOKEN = process.env.PRINTIFY_API_TOKEN || "";
const PRINTIFY_API_BASE = "https://api.printify.com/v1";

export function isPrintifyConfigured(): boolean {
  return Boolean(PRINTIFY_API_TOKEN);
}

async function printifyRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  if (!isPrintifyConfigured()) {
    throw new Error("Printify is not configured");
  }

  const url = `${PRINTIFY_API_BASE}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${PRINTIFY_API_TOKEN}`,
      "Content-Type": "application/json;charset=utf-8",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `Printify API error (${response.status}): ${error}`
    );
  }

  return response.json();
}

/**
 * Get list of shops (stores) associated with this account
 */
export async function getShops(): Promise<any[]> {
  return printifyRequest("/shops.json");
}

/**
 * Get all available blueprints (product templates)
 */
export async function getBlueprints(): Promise<any[]> {
  return printifyRequest("/catalog/blueprints.json");
}

/**
 * Get details for a specific blueprint
 */
export async function getBlueprint(blueprintId: number): Promise<any> {
  return printifyRequest(`/catalog/blueprints/${blueprintId}.json`);
}

/**
 * Get print providers for a specific blueprint
 */
export async function getPrintProviders(blueprintId: number): Promise<any[]> {
  return printifyRequest(
    `/catalog/blueprints/${blueprintId}/print_providers.json`
  );
}

/**
 * Get variants (sizes/colors) for a blueprint from a specific provider
 */
export async function getVariants(
  blueprintId: number,
  printProviderId: number
): Promise<any> {
  return printifyRequest(
    `/catalog/blueprints/${blueprintId}/print_providers/${printProviderId}/variants.json`
  );
}

/**
 * Get shipping info for a blueprint from a specific provider
 */
export async function getShipping(
  blueprintId: number,
  printProviderId: number
): Promise<any> {
  return printifyRequest(
    `/catalog/blueprints/${blueprintId}/print_providers/${printProviderId}/shipping.json`
  );
}

/**
 * Upload an image to Printify
 * @param imageUrl - Public URL of the image to upload
 * @param fileName - Name for the uploaded file
 */
export async function uploadImage(
  imageUrl: string,
  fileName: string
): Promise<any> {
  return printifyRequest("/uploads/images.json", {
    method: "POST",
    body: JSON.stringify({
      file_name: fileName,
      url: imageUrl,
    }),
  });
}

/**
 * Upload image from base64
 */
export async function uploadImageBase64(
  base64Contents: string,
  fileName: string
): Promise<any> {
  return printifyRequest("/uploads/images.json", {
    method: "POST",
    body: JSON.stringify({
      file_name: fileName,
      contents: base64Contents,
    }),
  });
}

/**
 * Create a product in Printify
 */
export async function createProduct(
  shopId: string,
  productData: {
    title: string;
    description?: string;
    blueprint_id: number;
    print_provider_id: number;
    variants: Array<{ id: number; price: number }>;
    print_areas: Array<{
      variant_ids: number[];
      placeholders: Array<{
        position: string;
        images: Array<{
          id: string;
          x: number;
          y: number;
          scale: number;
          angle: number;
        }>;
      }>;
    }>;
  }
): Promise<any> {
  return printifyRequest(`/shops/${shopId}/products.json`, {
    method: "POST",
    body: JSON.stringify(productData),
  });
}

/**
 * Get all products in a shop
 */
export async function getProducts(shopId: string, page = 1): Promise<any> {
  return printifyRequest(`/shops/${shopId}/products.json?page=${page}&limit=50`);
}

/**
 * Get a specific product (includes mockup images in images array)
 */
export async function getProduct(shopId: string, productId: string): Promise<any> {
  return printifyRequest(`/shops/${shopId}/products/${productId}.json`);
}

/**
 * Get mockup images for a product
 * Returns array of image objects with src, variant_ids, position, is_default
 * Note: Mockups are generated asynchronously - may need to wait 5-10 seconds after product creation
 */
export async function getProductMockups(shopId: string, productId: string): Promise<Array<{
  src: string;
  variant_ids: number[];
  position: string;
  is_default: boolean;
}>> {
  const product = await getProduct(shopId, productId);
  return product.images || [];
}

/**
 * Publish a product (make it available for sale)
 */
export async function publishProduct(
  shopId: string,
  productId: string
): Promise<any> {
  return printifyRequest(`/shops/${shopId}/products/${productId}/publish.json`, {
    method: "POST",
    body: JSON.stringify({ title: true, description: true, images: true, variants: true, tags: true }),
  });
}

/**
 * Submit an order to Printify for fulfillment
 */
export async function createOrder(
  shopId: string,
  orderData: {
    external_id: string; // Shopify order ID
    line_items: Array<{
      product_id: string;
      variant_id: number;
      quantity: number;
    }>;
    shipping_method: number;
    send_shipping_notification: boolean;
    address_to: {
      first_name: string;
      last_name: string;
      email: string;
      phone: string;
      country: string;
      region: string;
      address1: string;
      address2?: string;
      city: string;
      zip: string;
    };
  }
): Promise<any> {
  return printifyRequest(`/shops/${shopId}/orders.json`, {
    method: "POST",
    body: JSON.stringify(orderData),
  });
}

/**
 * Get order status
 */
export async function getOrder(shopId: string, orderId: string): Promise<any> {
  return printifyRequest(`/shops/${shopId}/orders/${orderId}.json`);
}

/**
 * Calculate shipping cost for an order
 */
export async function calculateShipping(
  shopId: string,
  line_items: Array<{
    product_id: string;
    variant_id: number;
    quantity: number;
  }>,
  address_to: {
    first_name: string;
    last_name: string;
    country: string;
    region: string;
    address1: string;
    city: string;
    zip: string;
  }
): Promise<any> {
  return printifyRequest(`/shops/${shopId}/orders/shipping.json`, {
    method: "POST",
    body: JSON.stringify({ line_items, address_to }),
  });
}

/**
 * Helper: Get all wall print blueprints
 * Filters blueprints to only include posters, canvas, framed prints, metal prints, etc.
 */
export async function getWallPrintBlueprints(): Promise<any[]> {
  const allBlueprints = await getBlueprints();
  
  // Filter for wall art related keywords
  const wallArtKeywords = [
    "poster",
    "canvas",
    "print",
    "framed",
    "metal",
    "acrylic",
    "wood",
    "wall art",
    "art print",
    "gallery"
  ];

  return allBlueprints.filter((blueprint: any) => {
    const title = blueprint.title.toLowerCase();
    const description = (blueprint.description || "").toLowerCase();
    const combined = `${title} ${description}`;
    
    return wallArtKeywords.some(keyword => combined.includes(keyword));
  });
}
