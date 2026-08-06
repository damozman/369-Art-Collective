/**
 * Shopify's three mandatory compliance webhooks.
 *
 * Every public App Store listing must implement these. They are a hard
 * requirement, not a recommendation, and Shopify actively tests them during
 * review — including by sending a deliberately BAD signature and checking that
 * you reject it.
 *
 * ────────────────────────────────────────────────────────────────────────
 * THREE THINGS THAT ARE DIFFERENT FROM THE ORDER WEBHOOKS
 * ────────────────────────────────────────────────────────────────────────
 *
 * 1. **They are signed with the APP's client secret, not a per-connection
 *    secret.** `routes.ts` looks the signing secret up on the connection row,
 *    because that is where an Admin-API-created webhook's secret lives. These
 *    are app-managed, so the secret is one value for the whole deployment:
 *    `SHOPIFY_API_SECRET`. Verifying these against a connection's stored secret
 *    would fail every time.
 *
 * 2. **⚠️ THEY ARRIVE FOR SHOPS THAT ARE NO LONGER CONNECTED, AND THAT IS THE
 *    NORMAL CASE.** `shop/redact` is sent roughly 48 hours AFTER the app is
 *    uninstalled — by which time `app/uninstalled` has already run and
 *    destroyed the stored credential. A handler that looks up a connection and
 *    401s when it finds none would fail the exact delivery it exists to serve.
 *    Nothing here requires a connection to exist.
 *
 * 3. **A missing secret must FAIL, not pass.** The tempting shortcut — "no
 *    secret configured, so skip verification" — turns these into unauthenticated
 *    endpoints that will erase data on request from anybody. They refuse
 *    instead.
 *
 * ────────────────────────────────────────────────────────────────────────
 * WHAT WE ACTUALLY HOLD, WHICH IS THE WHOLE ANSWER TO TWO OF THE THREE
 * ────────────────────────────────────────────────────────────────────────
 *
 * **No customer personal data. Anywhere.** A Shopify order becomes a
 * `RevenueEvent` carrying the order id, the line item id, amounts, currency,
 * quantity and a work reference. No name, no email, no address, no phone, no
 * customer id. `map.ts` never reads those fields and the schema has nowhere to
 * put them.
 *
 * That is not luck — it is what the product needs. We split revenue between the
 * people who made the thing; who bought it is irrelevant to that arithmetic.
 *
 * So `customers/data_request` and `customers/redact` are honest no-ops: we
 * respond, and report that we hold nothing about that person. Inventing a
 * "deletion" of data we never had would be theatre.
 */

import { and, eq } from "drizzle-orm";

import * as schema from "@shared/engine-schema";
import type { EngineDb } from "../../ingest";
import { disconnectConnection, findConnectionByExternalRef } from "../../connections";
import { normalizeShopDomain } from "./webhook-auth";

export type ComplianceTopic =
  | "customers/data_request"
  | "customers/redact"
  | "shop/redact";

export interface ComplianceResult {
  topic: ComplianceTopic;
  /** Plain-language summary, logged and returned. Never contains personal data. */
  outcome: string;
  /** How many rows were actually changed. Zero is a normal, correct answer. */
  affected: number;
}

/**
 * "A customer has asked what you hold about them."
 *
 * We hold nothing. The response says so and the merchant relays it.
 *
 * Shopify's requirement is that the app *responds*; it does not mandate a
 * particular payload, because the app has no channel to the customer. Returning
 * an accurate "we store no customer data" is both the truth and the most useful
 * thing the merchant can pass on.
 */
export async function handleCustomerDataRequest(): Promise<ComplianceResult> {
  return {
    topic: "customers/data_request",
    outcome:
      "No customer personal data is stored. Orders are recorded as amounts and " +
      "line references for splitting revenue between contributors; no customer " +
      "name, email, address or identifier is retained.",
    affected: 0,
  };
}

/**
 * "A customer has asked you to erase them."
 *
 * Nothing to erase, for the same reason. Reported honestly rather than
 * pretending a deletion happened.
 */
export async function handleCustomerRedact(): Promise<ComplianceResult> {
  return {
    topic: "customers/redact",
    outcome:
      "Nothing to erase — no customer personal data is stored against orders.",
    affected: 0,
  };
}

/**
 * "This shop uninstalled 48 hours ago. Erase its data."
 *
 * ⚠️ THIS DELIBERATELY DOES NOT DELETE THE TENANT'S LEDGER, AND THAT IS THE
 * MOST IMPORTANT DECISION IN THIS FILE.
 *
 * The obvious reading of "erase the shop's data" is to drop everything we hold
 * for that business. It would be wrong, in a way that could not be undone:
 *
 *   • **The ledger is the tenant's own financial record.** It is what their
 *     year-end reporting is built from and what every contributor's statement
 *     is derived from. Deleting it because a Shopify app was uninstalled would
 *     destroy records they are required to keep and that their contributors are
 *     entitled to see.
 *   • **Uninstalling the Shopify app is not leaving us.** A tenant can keep
 *     using this product entirely through CSV import and Stripe, with no store
 *     connected at all. That is a supported configuration, not an edge case.
 *   • **Money that has already moved cannot be un-recorded.** Payments were
 *     made to real people from a real bank account. A record of those has to
 *     survive.
 *
 * What Shopify's requirement is actually about is the *shop's* data — the
 * credentials, the connection, and anything identifying that storefront. So
 * that is what this removes: the connection is severed and its sealed
 * credentials destroyed. Amounts and contributor allocations stay.
 *
 * Deleting a tenant outright is a separate, deliberate act with its own path
 * (§5 #14: offboarding is export-then-delete, requested by the tenant), and it
 * is not something an inbound webhook should be able to trigger.
 */
export async function handleShopRedact(
  db: EngineDb,
  shopDomain: string
): Promise<ComplianceResult> {
  const normalized = normalizeShopDomain(shopDomain);
  const connection = await findConnectionByExternalRef(db, "shopify", normalized);

  if (!connection) {
    // The overwhelmingly common case: `app/uninstalled` already ran and tore
    // the connection down. Nothing left to do, and that is success.
    return {
      topic: "shop/redact",
      outcome: "No connection for that shop — already removed at uninstall.",
      affected: 0,
    };
  }

  await disconnectConnection(db, connection.id, "revoked");

  return {
    topic: "shop/redact",
    outcome:
      "Store connection and stored credentials destroyed. Revenue records and " +
      "contributor payment history are retained as the business's own financial " +
      "record — they contain no shop or customer personal data.",
    affected: 1,
  };
}

/**
 * Record that a compliance request arrived and what was done.
 *
 * Written to the tenant's audit log when the shop is known, because "somebody
 * asked us to erase this store" is exactly the kind of thing that should be
 * answerable a year later. Never records the customer id or email from the
 * payload — logging identifiers in response to an erasure request would be
 * absurd.
 */
export async function logComplianceRequest(
  db: EngineDb,
  options: { tenantId: string | null; result: ComplianceResult; shopDomain: string | null }
): Promise<void> {
  if (!options.tenantId) return;

  try {
    await db.insert(schema.auditLog).values({
      tenantId: options.tenantId,
      actorType: "system",
      actorId: null,
      action: "compliance_request",
      entityType: "source_connection",
      entityId: null,
      after: {
        topic: options.result.topic,
        outcome: options.result.outcome,
        shopDomain: options.shopDomain,
      },
    });
  } catch {
    // A compliance webhook must be acknowledged even if the note cannot be
    // written; failing here would make Shopify retry an action already taken.
  }
}

/** Which tenant a shop belongs to, if any. Null is normal after an uninstall. */
export async function tenantForShop(
  db: EngineDb,
  shopDomain: string
): Promise<string | null> {
  const [row] = await db
    .select({ tenantId: schema.sourceConnections.tenantId })
    .from(schema.sourceConnections)
    .where(
      and(
        eq(schema.sourceConnections.provider, "shopify"),
        eq(schema.sourceConnections.externalRef, normalizeShopDomain(shopDomain))
      )
    )
    .limit(1);

  return row?.tenantId ?? null;
}
