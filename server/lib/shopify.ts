import fs from "fs";
import path from "path";
import { getProductTypeConfig, getShopifyTemplate, getProductTypeTags, getShopifyProductType } from "./product-types";

const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || "";
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";

// HTML escape function to prevent XSS/injection attacks
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function isShopifyConfigured(): boolean {
  return Boolean(shopifyShopUrl && shopifyAccessToken);
}

export interface ShopifyProduct {
  title: string;
  body_html?: string;
  vendor?: string;
  product_type?: string;
  tags?: string;
  status: "draft" | "active";
  images?: Array<{ src: string }>;
}

interface ArtworkData {
  title: string;
  description?: string;
  artistName: string;
  artistShort: string;
  artworkId: string;
  imageUrl: string;
  tags?: string[];
  artworkStory?: string;
  styleTags?: string[];
  suggestedUse?: string;
  seoSlug?: string;
  productType?: string; // Product type for template assignment (defaults to "art_print")
}

function loadConfig<T>(filename: string): T {
  const configPath = path.join(process.cwd(), "config", filename);
  return JSON.parse(fs.readFileSync(configPath, "utf-8"));
}

/**
 * Convert relative image URL to full public URL for Shopify
 * Shopify requires publicly accessible URLs to download images
 */
function convertToFullImageUrl(imageUrl: string): string {
  // If already a full URL, return as-is
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }

  // Use published app URL for public image access
  // CRITICAL: Shopify cannot access development workspace URLs (picard.replit.dev)
  // Must use published production URL (247portal.replit.app) for image downloads
  const publicUrl = process.env.PUBLIC_APP_URL || 'https://247portal.replit.app';

  // Convert relative path to full URL
  const cleanPath = imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`;
  const fullUrl = `${publicUrl}${cleanPath}`;
  
  // Debug logging to verify correct URL generation
  console.log(`[SHOPIFY_URL_FIX] Generated URL: ${fullUrl}`);
  console.log(`[SHOPIFY_URL_FIX] Using public URL: ${publicUrl}`);
  
  return fullUrl;
}

export async function createArtworkProduct(artwork: ArtworkData): Promise<any> {
  if (!isShopifyConfigured()) {
    throw new Error("Shopify is not configured");
  }

  try {
    // Convert artwork image URL to full public URL for Shopify
    const fullImageUrl = convertToFullImageUrl(artwork.imageUrl);
    
    // Get product type configuration (defaults to art_print)
    const productType = artwork.productType || "art_print";
    const productTypeConfig = getProductTypeConfig(productType);
    const shopifyTemplate = getShopifyTemplate(productType);
    const shopifyProductType = getShopifyProductType(productType);
    const productTypeTags = getProductTypeTags(productType);

    // Load configuration files
    const providerConfig = loadConfig<any>("provider_config.json");
    const pricingMatrix = loadConfig<any>("pricing_matrix.json");
    const weights = loadConfig<any>("weights_lb.json");

    // Phase 1: Paper and Canvas only
    const finishes = ["Paper", "Canvas"];
    const sizes = providerConfig.sizes;

    // Build variants for Size × Finish combinations
    const variants = [];
    for (const finish of finishes) {
      for (const size of sizes) {
        variants.push({
          option1: size,
          option2: finish,
          price: String(pricingMatrix[finish][size].toFixed(2)),
          sku: `ART-${artwork.artistShort}-${artwork.artworkId}-${size}-${finish}`,
          inventory_management: null,
          inventory_policy: "continue",
          weight: weights[finish][size],
          weight_unit: "lb",
        });
      }
    }

    // Build comprehensive tags including product type tags and style tags
    const tags = [
      "New",
      ...productTypeTags,
      ...finishes.map(f => `Finish:${f}`),
      `Artist:${artwork.artistName}`,
      ...(artwork.tags || []),
      ...(artwork.styleTags || []).map(tag => `Style:${tag}`),
    ];

    // Build rich HTML product description with marketing content
    // SECURITY: All user-supplied content is HTML-escaped to prevent XSS/injection attacks
    let bodyHtml = "";
    
    // Main description
    if (artwork.description) {
      bodyHtml += `<p>${escapeHtml(artwork.description)}</p>`;
    }
    
    // Artwork story section
    if (artwork.artworkStory) {
      bodyHtml += `<div style="margin-top: 1.5rem;">`;
      bodyHtml += `<h3 style="font-weight: 600; margin-bottom: 0.5rem;">The Story Behind This Artwork</h3>`;
      bodyHtml += `<p style="color: #555;">${escapeHtml(artwork.artworkStory)}</p>`;
      bodyHtml += `</div>`;
    }
    
    // Suggested use section
    if (artwork.suggestedUse) {
      bodyHtml += `<div style="margin-top: 1.5rem;">`;
      bodyHtml += `<h3 style="font-weight: 600; margin-bottom: 0.5rem;">Perfect For</h3>`;
      bodyHtml += `<p style="color: #555;">${escapeHtml(artwork.suggestedUse)}</p>`;
      bodyHtml += `</div>`;
    }
    
    // Artist attribution (artist name also escaped for safety)
    bodyHtml += `<div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #e5e5e5;">`;
    bodyHtml += `<p style="font-style: italic;">Created by <strong>${escapeHtml(artwork.artistName)}</strong></p>`;
    bodyHtml += `</div>`;
    
    // Fallback if no content
    if (!bodyHtml) {
      bodyHtml = `<p>${escapeHtml(artwork.title)} by ${escapeHtml(artwork.artistName)}</p>`;
    }

    const productPayload: any = {
      product: {
        title: artwork.title,
        body_html: bodyHtml,
        vendor: artwork.artistName,
        product_type: shopifyProductType,
        status: "active", // Immediately publish to Online Store
        published_at: new Date().toISOString(), // Set publication timestamp
        published_scope: "web", // Publish to Online Store (web) not Point of Sale
        tags: tags.join(", "),
        options: [
          { name: "Size", values: sizes },
          { name: "Finish", values: finishes },
        ],
        images: [{ src: fullImageUrl, alt: artwork.title }],
        variants,
      },
    };
    
    // Add Shopify template suffix if configured for this product type
    if (shopifyTemplate) {
      productPayload.product.template_suffix = shopifyTemplate;
      console.log(`[Shopify] Assigning template "${shopifyTemplate}" to product "${artwork.title}"`);
    }
    
    // Add SEO-friendly handle (URL slug) if available
    if (artwork.seoSlug) {
      productPayload.product.handle = artwork.seoSlug;
    }

    console.log(`[Shopify] Creating product "${artwork.title}" with image URL: ${fullImageUrl}`);

    const apiVersion = "2024-10";
    const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products.json`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": shopifyAccessToken,
      },
      body: JSON.stringify(productPayload),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Shopify API error: ${error}`);
    }

    const result = await response.json();
    const productId = result?.product?.id;

    // Add metafields for tracking
    if (productId) {
      const metafieldUrl = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products/${productId}/metafields.json`;
      
      await Promise.all([
        fetch(metafieldUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": shopifyAccessToken,
          },
          body: JSON.stringify({
            metafield: {
              namespace: "247pn",
              key: "artist_id",
              type: "single_line_text_field",
              value: artwork.artistShort,
            },
          }),
        }),
        fetch(metafieldUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": shopifyAccessToken,
          },
          body: JSON.stringify({
            metafield: {
              namespace: "247pn",
              key: "artwork_id",
              type: "single_line_text_field",
              value: String(artwork.artworkId),
            },
          }),
        }),
        fetch(metafieldUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": shopifyAccessToken,
          },
          body: JSON.stringify({
            metafield: {
              namespace: "247pn",
              key: "provider",
              type: "single_line_text_field",
              value: "manual",
            },
          }),
        }),
      ]);
    }

    return result;
  } catch (error: any) {
    console.error("Shopify API error:", error);
    throw new Error(`Failed to create Shopify product: ${error.message}`);
  }
}

// Update product status (active/draft) in Shopify
export async function updateProductStatus(
  shopifyProductId: string,
  status: "active" | "draft"
): Promise<any> {
  if (!isShopifyConfigured()) {
    throw new Error("Shopify is not configured");
  }

  try {
    const apiVersion = "2024-10";
    const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products/${shopifyProductId}.json`;

    console.log(`[Shopify] Updating product ${shopifyProductId} status to: ${status}`);

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": shopifyAccessToken,
      },
      body: JSON.stringify({
        product: {
          id: shopifyProductId,
          status: status,
          published_scope: "web", // Ensure it's published to Online Store (web) not Point of Sale
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Shopify API error: ${error}`);
    }

    const result = await response.json();
    console.log(`[Shopify] Product ${shopifyProductId} status updated to: ${status}`);
    return result;
  } catch (error: any) {
    console.error("Shopify update status error:", error);
    throw new Error(`Failed to update Shopify product status: ${error.message}`);
  }
}

// Delete all products from Shopify store
export async function deleteAllProducts(): Promise<{ deleted: number; errors: string[] }> {
  if (!isShopifyConfigured()) {
    throw new Error("Shopify is not configured");
  }

  try {
    const apiVersion = "2024-10";
    let allProducts: any[] = [];
    let pageInfo: string | null = null;
    
    // Fetch all products (paginated)
    do {
      let url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products.json?limit=250`;
      if (pageInfo) {
        url += `&page_info=${pageInfo}`;
      }

      const response = await fetch(url, {
        headers: {
          "X-Shopify-Access-Token": shopifyAccessToken,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch products: ${await response.text()}`);
      }

      const data = await response.json();
      allProducts = allProducts.concat(data.products || []);
      
      // Check for pagination
      const linkHeader = response.headers.get("Link");
      pageInfo = null;
      if (linkHeader) {
        const nextMatch = linkHeader.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="next"/);
        if (nextMatch) {
          pageInfo = nextMatch[1];
        }
      }
    } while (pageInfo);

    console.log(`[Shopify] Found ${allProducts.length} products to delete`);

    // Delete each product
    const errors: string[] = [];
    let deleted = 0;

    for (const product of allProducts) {
      try {
        const deleteUrl = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products/${product.id}.json`;
        const response = await fetch(deleteUrl, {
          method: "DELETE",
          headers: {
            "X-Shopify-Access-Token": shopifyAccessToken,
          },
        });

        if (response.ok) {
          deleted++;
          console.log(`[Shopify] Deleted product: ${product.title} (ID: ${product.id})`);
        } else {
          const error = await response.text();
          errors.push(`Failed to delete ${product.title}: ${error}`);
        }

        // Rate limiting: Shopify allows 2 requests per second
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error: any) {
        errors.push(`Error deleting ${product.title}: ${error.message}`);
      }
    }

    return { deleted, errors };
  } catch (error: any) {
    console.error("Shopify bulk delete error:", error);
    throw new Error(`Failed to delete Shopify products: ${error.message}`);
  }
}

/**
 * Add additional images to an existing Shopify product
 * Useful for adding Printify mockup images after product creation
 */
export async function addProductImages(
  shopifyProductId: string,
  imageUrls: Array<{ src: string; alt?: string; position?: number }>
): Promise<any> {
  if (!isShopifyConfigured()) {
    throw new Error("Shopify is not configured");
  }

  try {
    const apiVersion = "2024-10";
    const results = [];

    // Add each image
    for (const image of imageUrls) {
      const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products/${shopifyProductId}/images.json`;
      
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": shopifyAccessToken,
        },
        body: JSON.stringify({
          image: {
            src: image.src,
            alt: image.alt || "",
            position: image.position,
          },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.warn(`[Shopify] Failed to add image ${image.src}: ${error}`);
        continue;
      }

      const result = await response.json();
      results.push(result);
      
      // Rate limiting: Shopify allows 2 requests per second
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`[Shopify] Added ${results.length} images to product ${shopifyProductId}`);
    return results;
  } catch (error: any) {
    console.error("Shopify add images error:", error);
    throw new Error(`Failed to add images to Shopify product: ${error.message}`);
  }
}

// Legacy function for backward compatibility
export async function createDraftProduct(product: ShopifyProduct): Promise<any> {
  if (!isShopifyConfigured()) {
    throw new Error("Shopify is not configured");
  }

  try {
    const apiVersion = "2024-01";
    const url = `https://${shopifyShopUrl}/admin/api/${apiVersion}/products.json`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": shopifyAccessToken,
      },
      body: JSON.stringify({ product }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Shopify API error: ${error}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error("Shopify API error:", error);
    throw new Error(`Failed to create Shopify product: ${error.message}`);
  }
}
