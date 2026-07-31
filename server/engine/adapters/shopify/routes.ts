/**
 * The Shopify webhook endpoint.
 *
 * ONE URL FOR EVERY TENANT, deliberately. A Shopify app registers a single
 * webhook address per topic; the store identifies itself in the
 * `X-Shopify-Shop-Domain` header and that header is the routing key into
 * `engine_source_connections`. There is no tenant in the path because there
 * cannot be one — which is why the domain→connection lookup is a uniqueness
 * constraint in the schema rather than an application convention.
 *
 * THE ORDER OF CHECKS IS THE SECURITY PROPERTY:
 *
 *   1. Find the connection for the shop domain.
 *   2. Verify the HMAC against that connection's stored secret.
 *   3. Only then parse the body as an order and touch the ledger.
 *
 * Nothing before step 2 writes anything. An unsigned or wrongly-signed request
 * gets a 401 having caused no side effect at all — no ledger row, no lookup
 * that could be timed, no error field updated on the connection that an
 * attacker could use to confirm a store exists.
 *
 * WHY THE STATUS CODES MATTER MORE THAN USUAL. Shopify retries any non-2xx for
 * up to 48 hours with backoff, and gives up after 19 failures — then disables
 * the subscription. So:
 *
 *   • 200 on success, on a duplicate, and on a topic we do not handle. All
 *     three are "this delivery is finished", and asking Shopify to retry them
 *     would be noise.
 *   • 401 on a signature failure. Retrying will not help and we want it to stop.
 *   • 500 on an internal failure. This is the one case where the retry is
 *     wanted: a database hiccup should not lose a sale, and re-delivery is safe
 *     because `(tenant, source, sourceEventId)` makes ingestion idempotent.
 *
 * Returning 200 on an internal error is the tempting shortcut and it silently
 * discards revenue.
 */

import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";

import * as schema from "@shared/engine-schema";
import type { EngineDb } from "../../ingest";
import {
  disconnectConnection,
  findConnectionByExternalRef,
  markConnectionError,
  markConnectionEvent,
  openCredential,
  openWebhookSecret,
  type ConnectionStatus,
} from "../../connections";
import { NoLineCostSource, type LineCostSource } from "../cost-source";
import { LiveShopifyClient, type ShopifyAdminClient } from "./client";
import {
  ingestShopifyCancellation,
  ingestShopifyOrder,
  ingestShopifyRefund,
  readShopifySettings,
} from "./ingest";
import type { ShopifyOrder, ShopifyRefund } from "./types";
import {
  normalizeShopDomain,
  readWebhookHeaders,
  verifyShopifyWebhook,
} from "./webhook-auth";

export interface ShopifyWebhookOptions {
  /**
   * Overrides the live Admin API client. Supplied by tests and by any
   * deployment running against fixtures; when absent a live client is built
   * from the connection's own credential.
   */
  clientFor?: (shopDomain: string, accessToken: string) => ShopifyAdminClient;
  /** Where supplier costs come from. Defaults to none — see `cost-source.ts`. */
  costSource?: LineCostSource;
}

/**
 * Read the exact bytes Shopify sent.
 *
 * `server/index.ts` stashes them in `req.rawBody` via `express.json`'s `verify`
 * hook. If that ever stops happening the signature cannot be checked, and the
 * only safe response is to reject — never to skip the check because the body is
 * inconvenient to get at.
 */
function rawBodyOf(req: Request): Buffer | null {
  const raw = (req as Request & { rawBody?: unknown }).rawBody;
  if (Buffer.isBuffer(raw)) return raw;
  if (typeof raw === "string") return Buffer.from(raw, "utf8");
  return null;
}

export function createShopifyWebhookRouter(
  db: EngineDb,
  options: ShopifyWebhookOptions = {}
): Router {
  const router = Router();

  router.post("/webhooks/shopify", async (req: Request, res: Response) => {
    const headers = readWebhookHeaders(req.headers as Record<string, string | undefined>);

    if (!headers.shopDomain) {
      return res.status(401).json({ message: "Missing shop domain" });
    }
    if (!headers.topic) {
      return res.status(400).json({ message: "Missing topic" });
    }

    const shopDomain = normalizeShopDomain(headers.shopDomain);
    const connection = await findConnectionByExternalRef(db, "shopify", shopDomain);

    if (!connection) {
      // Deliberately the same shape as a signature failure. A store we have no
      // connection to and a store whose signature is wrong should look
      // identical from outside.
      return res.status(401).json({ message: "Unrecognised delivery" });
    }

    const rawBody = rawBodyOf(req);
    if (!rawBody) {
      console.error(
        "[shopify-webhook] Raw body unavailable — cannot verify signature. " +
          "Check that express.json's verify hook still populates req.rawBody."
      );
      return res.status(500).json({ message: "Cannot verify delivery" });
    }

    let secret: string | null;
    try {
      secret = openWebhookSecret(connection);
    } catch (error) {
      console.error("[shopify-webhook] Could not open webhook secret", error);
      return res.status(500).json({ message: "Cannot verify delivery" });
    }

    const verdict = verifyShopifyWebhook(rawBody, headers.hmac, secret ?? "");
    if (!verdict.ok) {
      console.warn(
        `[shopify-webhook] Rejected ${headers.topic} from ${shopDomain}: ${verdict.reason}`
      );
      return res.status(verdict.status).json({ message: "Unrecognised delivery" });
    }

    // ---- Verified. Only now does anything happen. ----

    const settings = readShopifySettings(
      connection.settings as Record<string, unknown> | null
    );

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      // Malformed JSON that nonetheless carries a valid signature is not
      // something a retry fixes.
      return res.status(400).json({ message: "Malformed payload" });
    }

    try {
      switch (headers.topic) {
        case "orders/paid": {
          const order = payload as ShopifyOrder;
          const client = buildClient(connection, options);
          const result = await ingestShopifyOrder(db, order, {
            tenantId: connection.tenantId,
            config: settings,
            client: client ?? undefined,
            costSource: options.costSource ?? new NoLineCostSource(),
          });
          await markConnectionEvent(db, connection.id);
          return res.status(200).json({
            ok: true,
            orderId: result.orderId,
            ingested: result.ingested,
            duplicates: result.duplicates,
            heldForReview: result.heldForReview,
            skipped: result.skipped,
          });
        }

        case "refunds/create": {
          const refund = payload as ShopifyRefund;
          const result = await ingestShopifyRefund(db, refund, {
            tenantId: connection.tenantId,
            // A refund payload has no currency of its own; the connection's
            // tenant currency is the one the sale was recorded in.
            currency: await tenantCurrency(db, connection.tenantId),
          });
          await markConnectionEvent(db, connection.id);
          return res.status(200).json({
            ok: true,
            refundId: result.refundId,
            reversed: result.reversals.filter((r) => r.status === "reversed").length,
            needsReview: result.needsReview,
          });
        }

        case "orders/cancelled": {
          const order = payload as ShopifyOrder;
          const result = await ingestShopifyCancellation(db, order, {
            tenantId: connection.tenantId,
          });
          await markConnectionEvent(db, connection.id);
          return res.status(200).json({
            ok: true,
            orderId: result.orderId,
            reversed: result.reversals.filter((r) => r.status === "reversed").length,
          });
        }

        case "app/uninstalled": {
          // The token is dead the moment the merchant uninstalls. Destroying it
          // here means a stale credential does not sit in the database being
          // retried against a store that no longer trusts us.
          await disconnectConnection(db, connection.id, "revoked");
          return res.status(200).json({ ok: true, disconnected: true });
        }

        default:
          // Acknowledged so Shopify stops. Subscribing to a topic we do not
          // handle is a configuration mistake, not a delivery failure.
          return res.status(200).json({ ok: true, ignored: headers.topic });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[shopify-webhook] ${headers.topic} from ${shopDomain} failed`, error);
      await markConnectionError(db, connection.id, message, {
        // The connection itself is fine; one delivery failed. Promoting it to
        // `error` would tell the owner to reconnect a store that is working.
        status: connection.status as ConnectionStatus,
      });
      // 500 so Shopify redelivers. Ingestion is idempotent, so a redelivery of
      // something that partially succeeded cannot double-pay.
      return res.status(500).json({ message: "Processing failed" });
    }
  });

  return router;
}

function buildClient(
  connection: schema.SourceConnection,
  options: ShopifyWebhookOptions
): ShopifyAdminClient | null {
  // A fixture client needs no credential, which is the point — the endpoint is
  // exercisable end to end before any Partner approval exists.
  if (options.clientFor) {
    let token = "";
    if (connection.credentialSealed) {
      try {
        token = openCredential(connection);
      } catch {
        token = "";
      }
    }
    return options.clientFor(connection.externalRef, token);
  }

  if (!connection.credentialSealed) return null;

  try {
    return new LiveShopifyClient({
      shopDomain: connection.externalRef,
      accessToken: openCredential(connection),
    });
  } catch (error) {
    console.error("[shopify-webhook] Could not build an Admin API client", error);
    return null;
  }
}

async function tenantCurrency(db: EngineDb, tenantId: string): Promise<string> {
  const [tenant] = await db
    .select({ currency: schema.tenants.defaultCurrency })
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .limit(1);
  return tenant?.currency ?? "USD";
}
