const shopifyShopUrl = process.env.SHOPIFY_SHOP_URL || "";
const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN || "";

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

export async function createDraftProduct(product: ShopifyProduct): Promise<any> {
  if (!isShopifyConfigured()) {
    throw new Error("Shopify is not configured");
  }

  try {
    // Use Shopify Admin REST API directly
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
