/**
 * The three compliance endpoints, as separate URLs.
 *
 * Shopify's Partner dashboard asks for one URL per compliance topic, so they are
 * three routes rather than one switch. That also keeps them physically apart
 * from the revenue webhooks, which verify differently — see `gdpr.ts`.
 *
 * ⚠️ RETURNING 200 FOR A BAD SIGNATURE IS AN AUTOMATIC REJECTION. Shopify's
 * review sends a deliberately invalid HMAC and requires a 401. It is the single
 * most commonly failed item in this part of the review, and it is also just
 * correct: these endpoints erase things, so an unauthenticated caller must not
 * reach them.
 *
 * The success path is equally strict about one thing: acknowledge with 200 as
 * soon as the work is done. A 500 makes Shopify retry an erasure that already
 * happened, and repeated failures put the app's listing at risk.
 */

import { Router, type Request, type Response } from "express";

import type { EngineDb } from "../../ingest";
import {
  handleCustomerDataRequest,
  handleCustomerRedact,
  handleShopRedact,
  logComplianceRequest,
  tenantForShop,
  type ComplianceResult,
} from "./gdpr";
import { readWebhookHeaders, verifyShopifyWebhook } from "./webhook-auth";

export interface GdprRouterOptions {
  /**
   * The app's client secret. Read from the environment by default.
   *
   * Injectable so the endpoints can be exercised without putting a secret in
   * the environment of a test run.
   */
  appSecret?: string;
}

function rawBodyOf(req: Request): Buffer | null {
  const raw = (req as Request & { rawBody?: unknown }).rawBody;
  if (Buffer.isBuffer(raw)) return raw;
  if (typeof raw === "string") return Buffer.from(raw, "utf8");
  return null;
}

export function createShopifyGdprRouter(
  db: EngineDb,
  options: GdprRouterOptions = {}
): Router {
  const router = Router();

  /**
   * Everything the three endpoints share: verify, then hand off.
   *
   * Returns null when the request has already been answered, so each handler
   * can `if (!ok) return;` without repeating the failure shapes.
   */
  async function verified(
    req: Request,
    res: Response
  ): Promise<{ shopDomain: string | null } | null> {
    const headers = readWebhookHeaders(req.headers as Record<string, string | undefined>);
    const secret = options.appSecret ?? process.env.SHOPIFY_API_SECRET ?? "";

    if (!secret) {
      // Never "no secret, so skip the check". These endpoints erase things.
      console.error(
        "[shopify-gdpr] SHOPIFY_API_SECRET is not set — compliance webhooks " +
          "cannot be verified and are being refused."
      );
      return void res.status(401).json({ message: "Cannot verify delivery" }), null;
    }

    const rawBody = rawBodyOf(req);
    if (!rawBody) {
      console.error(
        "[shopify-gdpr] Raw body unavailable — cannot verify signature. Check " +
          "that express.json's verify hook still populates req.rawBody."
      );
      return void res.status(401).json({ message: "Cannot verify delivery" }), null;
    }

    const verdict = verifyShopifyWebhook(rawBody, headers.hmac, secret);
    if (!verdict.ok) {
      // 401, always. See the file header.
      return void res.status(401).json({ message: "Unrecognised delivery" }), null;
    }

    return { shopDomain: headers.shopDomain };
  }

  async function respond(
    res: Response,
    db: EngineDb,
    shopDomain: string | null,
    result: ComplianceResult
  ): Promise<void> {
    const tenantId = shopDomain ? await tenantForShop(db, shopDomain) : null;
    await logComplianceRequest(db, { tenantId, result, shopDomain });

    res.status(200).json({ ok: true, outcome: result.outcome });
  }

  /** "What do you hold about this customer?" — nothing. */
  router.post("/webhooks/shopify/customers/data_request", async (req, res) => {
    const ok = await verified(req, res);
    if (!ok) return;

    await respond(res, db, ok.shopDomain, await handleCustomerDataRequest());
  });

  /** "Erase this customer." — nothing to erase. */
  router.post("/webhooks/shopify/customers/redact", async (req, res) => {
    const ok = await verified(req, res);
    if (!ok) return;

    await respond(res, db, ok.shopDomain, await handleCustomerRedact());
  });

  /**
   * "Erase this shop." — the connection and its credentials, NOT the ledger.
   *
   * Arrives ~48h after uninstall, normally when no connection remains. That is
   * a success, not a miss.
   */
  router.post("/webhooks/shopify/shop/redact", async (req, res) => {
    const ok = await verified(req, res);
    if (!ok) return;

    if (!ok.shopDomain) {
      // Without a shop we cannot know what to remove. Acknowledged rather than
      // errored: retrying will not supply the missing header.
      return void res
        .status(200)
        .json({ ok: true, outcome: "No shop domain on the delivery — nothing to do." });
    }

    // Resolve the tenant BEFORE disconnecting, or the audit note has nowhere to
    // go — `handleShopRedact` is what removes the row it would be found by.
    const tenantId = await tenantForShop(db, ok.shopDomain);
    const result = await handleShopRedact(db, ok.shopDomain);

    await logComplianceRequest(db, { tenantId, result, shopDomain: ok.shopDomain });
    res.status(200).json({ ok: true, outcome: result.outcome });
  });

  return router;
}
