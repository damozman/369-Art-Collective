/**
 * Shopify Webhook Security
 * Verifies HMAC signatures to prevent forgery
 */

import crypto from "crypto";

/**
 * Verify Shopify webhook HMAC signature
 * @param rawBody - Raw request body (Buffer or string)
 * @param hmacHeader - X-Shopify-Hmac-Sha256 header value
 * @returns true if signature is valid
 */
export function verifyShopifyWebhook(rawBody: Buffer | string, hmacHeader: string | undefined): boolean {
  if (!hmacHeader) {
    console.warn("No HMAC header provided");
    return false;
  }

  // Use dedicated webhook secret if available, otherwise fall back to access token
  const shopifySecret = process.env.SHOPIFY_WEBHOOK_SECRET || process.env.SHOPIFY_ACCESS_TOKEN;
  if (!shopifySecret) {
    console.error("SHOPIFY_WEBHOOK_SECRET or SHOPIFY_ACCESS_TOKEN not configured");
    return false;
  }

  try {
    // Compute HMAC-SHA256 of the raw body
    const bodyString = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
    const hmac = crypto
      .createHmac("sha256", shopifySecret)
      .update(bodyString, "utf8")
      .digest("base64");

    // Compare with provided header (constant-time comparison)
    return crypto.timingSafeEqual(
      Buffer.from(hmac),
      Buffer.from(hmacHeader)
    );
  } catch (error) {
    console.error("HMAC verification error:", error);
    return false;
  }
}
