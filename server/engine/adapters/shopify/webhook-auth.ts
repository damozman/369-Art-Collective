/**
 * Proving an inbound webhook really came from Shopify.
 *
 * WHY THIS IS NOT OPTIONAL. The webhook endpoint has to be publicly reachable,
 * and it creates ledger entries. Without signature verification, anyone who
 * learns the URL can post a fabricated order and mint money owed to a
 * contributor of their choosing. There is no rate limit or obscurity that
 * substitutes for the check.
 *
 * THE RAW BODY IS THE INPUT, NOT THE PARSED OBJECT. The HMAC is computed over
 * the exact bytes Shopify sent. `JSON.parse` followed by `JSON.stringify`
 * reorders keys, drops insignificant whitespace, and reformats numbers, so a
 * signature check against a re-serialised body fails for every legitimate
 * delivery — and the usual "fix" is to stop checking. The Express route
 * therefore mounts a raw body parser ahead of the JSON one; see `routes.ts`.
 *
 * COMPARISON IS CONSTANT-TIME. `===` on a base64 digest leaks how many leading
 * bytes matched, which is enough to forge a signature byte by byte given
 * patience. `safeEqual` is in `secrets.ts` because every signing provider needs
 * it, not just this one.
 */

import { createHmac } from "node:crypto";

import { safeEqual } from "../../secrets";
import type { ShopifyWebhookHeaders } from "./types";

export type WebhookVerdict =
  | { ok: true }
  | { ok: false; reason: string; status: 401 | 400 };

/**
 * Verify the `X-Shopify-Hmac-Sha256` header against the raw request body.
 *
 * `secret` is the app's client secret for app-managed webhooks, or the
 * per-webhook signing secret for ones created through the Admin API. Which of
 * the two is stored is a property of how the connection was made, so it is read
 * from the connection row rather than assumed.
 */
export function verifyShopifyWebhook(
  rawBody: Buffer | string,
  hmacHeader: string | null | undefined,
  secret: string
): WebhookVerdict {
  if (!hmacHeader) {
    return { ok: false, reason: "Missing X-Shopify-Hmac-Sha256 header", status: 401 };
  }

  if (!secret) {
    // A missing secret must never be treated as "nothing to check against".
    return {
      ok: false,
      reason: "No webhook secret stored for this connection — cannot verify the delivery",
      status: 401,
    };
  }

  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, "utf8");

  const expected = createHmac("sha256", secret).update(body).digest("base64");

  if (!safeEqual(expected, hmacHeader)) {
    return { ok: false, reason: "Signature does not match", status: 401 };
  }

  return { ok: true };
}

/** Pull the Shopify headers off an Express-shaped request. */
export function readWebhookHeaders(
  headers: Record<string, string | string[] | undefined>
): ShopifyWebhookHeaders {
  const one = (name: string): string | null => {
    const value = headers[name];
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
  };

  return {
    hmac: one("x-shopify-hmac-sha256"),
    topic: one("x-shopify-topic"),
    shopDomain: one("x-shopify-shop-domain"),
    webhookId: one("x-shopify-webhook-id"),
    apiVersion: one("x-shopify-api-version"),
    triggeredAt: one("x-shopify-triggered-at"),
  };
}

/**
 * Normalize a shop domain for lookup.
 *
 * Shopify sends `store.myshopify.com`, but an owner typing the connection in by
 * hand will write `https://store.myshopify.com/`, `Store.myshopify.com`, or
 * just `store`. All four must find the same connection row, because a lookup
 * miss on an inbound webhook is silently dropped revenue.
 */
export function normalizeShopDomain(input: string): string {
  let value = input.trim().toLowerCase();
  value = value.replace(/^https?:\/\//, "");
  value = value.replace(/\/.*$/, "");
  value = value.replace(/\.$/, "");
  if (value && !value.includes(".")) {
    value = `${value}.myshopify.com`;
  }
  return value;
}

/**
 * Compute the header value Shopify would send for a body and secret.
 *
 * Exported so tests can build genuinely-signed fixtures rather than stubbing
 * the verifier out. A test that bypasses signing proves the mapper works and
 * says nothing about whether the endpoint is safe to expose.
 */
export function signWebhookBody(rawBody: Buffer | string, secret: string): string {
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, "utf8");
  return createHmac("sha256", secret).update(body).digest("base64");
}
