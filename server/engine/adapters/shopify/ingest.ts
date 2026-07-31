/**
 * The DB-facing half of the Shopify adapter.
 *
 * `map.ts` decides what an order *means*; this decides who it belongs to and
 * writes it. The split is deliberate — every money decision lives in the pure
 * half where it can be tested exhaustively without a database, and this half
 * contains only lookups and the call into `ingestEvent`.
 *
 * ATTRIBUTION HAPPENS HERE, NOT IN THE MAPPER. Shopify has no concept of a
 * contributor. The mapper produces a `workRef`; this module looks the work up
 * and expands `work_contributors` into contributor references. When the work is
 * unknown, or known but with nobody attached, the event is still recorded — the
 * revenue happened — and lands in the review queue where an owner can say who
 * it belongs to. `review.ts` then runs the *same* allocation path against the
 * event's own date, so a sale fixed three weeks late still pays what applied
 * when it was made.
 *
 * WHAT THIS MODULE WILL NOT DO. It will not allocate a line whose costs could
 * not be determined. A held line is recoverable; a royalty paid on an invented
 * cost is not, once the money has left.
 */

import { and, eq, inArray } from "drizzle-orm";

import * as schema from "@shared/engine-schema";
import {
  ingestEvent,
  reverseEvent,
  type EngineDb,
  type IngestResult,
} from "../../ingest";
import type { RevenueEvent } from "../../revenue-event";
import { NoLineCostSource, type LineCostSource } from "../cost-source";
import type { ShopifyAdminClient } from "./client";
import {
  mapCancellation,
  mapOrder,
  mapRefund,
  type MappedLine,
  type ShopifyMapConfig,
} from "./map";
import type { ShopifyOrder, ShopifyRefund } from "./types";

// ============================================================
// Connection settings
// ============================================================

/**
 * The defaults a store gets before anyone configures it.
 *
 * SKU attribution because that is how a print-on-demand store encodes the
 * artwork, and `feePolicy: "actual"` because the safe default is the one that
 * holds a line rather than the one that quietly absorbs an unknown cost. An
 * owner who wants the quiet behaviour has to choose it, which means somebody
 * decided rather than nobody noticing.
 */
export const DEFAULT_SHOPIFY_SETTINGS: ShopifyMapConfig = {
  attribution: { from: "sku" },
  feePolicy: "actual",
};

/**
 * Read adapter settings off a connection row, falling back to the defaults.
 *
 * Tolerant of missing and malformed fields on purpose: a settings blob written
 * by an older build must not stop today's webhook from being processed, and the
 * defaults are safe.
 */
export function readShopifySettings(
  settings: Record<string, unknown> | null | undefined
): ShopifyMapConfig {
  if (!settings || typeof settings !== "object") return DEFAULT_SHOPIFY_SETTINGS;

  const raw = settings as {
    attribution?: { from?: unknown; property?: unknown; pattern?: unknown };
    feePolicy?: unknown;
    allowTestOrders?: unknown;
  };

  const from =
    raw.attribution?.from === "sku" ||
    raw.attribution?.from === "variant_id" ||
    raw.attribution?.from === "product_id" ||
    raw.attribution?.from === "line_item_property"
      ? raw.attribution.from
      : DEFAULT_SHOPIFY_SETTINGS.attribution.from;

  return {
    attribution: {
      from,
      property:
        typeof raw.attribution?.property === "string" ? raw.attribution.property : undefined,
      pattern:
        typeof raw.attribution?.pattern === "string" ? raw.attribution.pattern : undefined,
    },
    feePolicy: raw.feePolicy === "none" ? "none" : "actual",
    allowTestOrders: raw.allowTestOrders === true,
  };
}

// ============================================================
// Attribution
// ============================================================

interface WorkAttribution {
  contributorRefs: Array<{ ref: string; role?: string }>;
  /** Set when nobody could be attached to this work. */
  reason?: string;
}

/**
 * Expand a work reference into contributor references.
 *
 * Returns an empty list plus a reason rather than throwing. Every one of these
 * outcomes is an ordinary operational state — a new artwork that has not been
 * set up yet, a product that is the merchant's own and owes nobody — and each
 * of them should produce a reviewable row, not a failed webhook that Shopify
 * retries nineteen times.
 */
async function attributeWork(
  db: EngineDb,
  tenantId: string,
  workRef: string | null
): Promise<WorkAttribution> {
  if (!workRef) {
    return { contributorRefs: [], reason: "No work reference on the line." };
  }

  const [work] = await db
    .select()
    .from(schema.works)
    .where(
      and(eq(schema.works.tenantId, tenantId), eq(schema.works.externalRef, workRef))
    )
    .limit(1);

  if (!work) {
    return {
      contributorRefs: [],
      reason: `No work matches the reference "${workRef}".`,
    };
  }

  const links = await db
    .select({
      role: schema.workContributors.role,
      externalRef: schema.contributors.externalRef,
    })
    .from(schema.workContributors)
    .innerJoin(
      schema.contributors,
      eq(schema.workContributors.contributorId, schema.contributors.id)
    )
    .where(
      and(
        eq(schema.workContributors.tenantId, tenantId),
        eq(schema.workContributors.workId, work.id)
      )
    );

  if (links.length === 0) {
    return {
      contributorRefs: [],
      reason: `"${work.title ?? workRef}" has nobody attached to it.`,
    };
  }

  // `externalRef` is nullable — a contributor added by hand in the console has
  // no external reference until something imports them. They cannot be
  // addressed by an adapter, so they are dropped here and the line falls to
  // review rather than paying whoever happens to remain.
  const addressable = links.filter(
    (link): link is typeof link & { externalRef: string } => Boolean(link.externalRef)
  );

  if (addressable.length !== links.length) {
    return {
      contributorRefs: [],
      reason:
        `"${work.title ?? workRef}" has ${links.length - addressable.length} contributor(s) ` +
        "with no external reference, so this sale cannot be split automatically.",
    };
  }

  return {
    contributorRefs: addressable.map((link) => ({
      ref: link.externalRef,
      role: link.role ?? undefined,
    })),
  };
}

// ============================================================
// Orders
// ============================================================

export interface ShopifyIngestOptions {
  tenantId: string;
  config: ShopifyMapConfig;
  client?: ShopifyAdminClient;
  costSource?: LineCostSource;
  /** Pre-fetched transactions, for callers that already have them. */
  transactions?: import("./types").ShopifyTransaction[] | null;
}

export interface ShopifyLineOutcome {
  sourceEventId: string;
  lineItemId: number;
  status: IngestResult["status"] | "skipped";
  eventId?: string;
  totalAllocatedMinor: bigint;
  reason?: string;
}

export interface ShopifyOrderIngestResult {
  orderId: number;
  lines: ShopifyLineOutcome[];
  ingested: number;
  duplicates: number;
  heldForReview: number;
  skipped: number;
  totalAllocatedMinor: bigint;
  warnings: string[];
}

/**
 * Ingest one Shopify order.
 *
 * Each line is independent: one line that cannot be attributed does not stop
 * the other from being paid. That mirrors how `runPayoutBatch` treats one
 * contributor's failed transfer, and for the same reason — an all-or-nothing
 * order would make one unconfigured artwork block every artist on the order.
 */
export async function ingestShopifyOrder(
  db: EngineDb,
  order: ShopifyOrder,
  options: ShopifyIngestOptions
): Promise<ShopifyOrderIngestResult> {
  const costSource = options.costSource ?? new NoLineCostSource();

  // Fetching transactions is the only reason the adapter needs API access at
  // all. A failure here is not fatal — `null` flows into the mapper, which
  // holds the lines under `feePolicy: "actual"` and ignores it under `"none"`.
  let transactions = options.transactions;
  if (transactions === undefined) {
    if (options.config.feePolicy === "actual" && options.client) {
      try {
        transactions = await options.client.getOrderTransactions(order.id);
      } catch {
        transactions = null;
      }
    } else {
      transactions = null;
    }
  }

  const mapped = mapOrder(order, { config: options.config, transactions });

  const result: ShopifyOrderIngestResult = {
    orderId: order.id,
    lines: [],
    ingested: 0,
    duplicates: 0,
    heldForReview: 0,
    skipped: 0,
    totalAllocatedMinor: 0n,
    warnings: [...mapped.warnings],
  };

  for (const skip of mapped.skipped) {
    result.skipped += 1;
    result.lines.push({
      sourceEventId: `${order.id}:${skip.lineItemId}`,
      lineItemId: skip.lineItemId,
      status: "skipped",
      totalAllocatedMinor: 0n,
      reason: skip.reason,
    });
  }

  for (const line of mapped.lines) {
    const outcome = await ingestLine(db, line, options.tenantId, costSource);
    result.lines.push(outcome);

    switch (outcome.status) {
      case "ingested":
        result.ingested += 1;
        result.totalAllocatedMinor += outcome.totalAllocatedMinor;
        break;
      case "duplicate":
        result.duplicates += 1;
        break;
      case "needs_review":
        result.heldForReview += 1;
        break;
      default:
        result.skipped += 1;
    }
  }

  return result;
}

async function ingestLine(
  db: EngineDb,
  line: MappedLine,
  tenantId: string,
  costSource: LineCostSource
): Promise<ShopifyLineOutcome> {
  const attribution = await attributeWork(db, tenantId, line.workRef);

  const costResult = await costSource.resolve({
    tenantId,
    currency: line.currency,
    quantity: line.quantity,
    grossAmountMinor: line.grossAmountMinor,
    workRef: line.workRef,
    sku: (line.metadata.sku as string | null) ?? null,
    productId:
      line.metadata.shopifyProductId != null ? String(line.metadata.shopifyProductId) : null,
    variantId:
      line.metadata.shopifyVariantId != null ? String(line.metadata.shopifyVariantId) : null,
    occurredAt: line.occurredAt,
  });

  const holdReasons = [line.holdReason, costResult.holdReason].filter(
    (reason): reason is string => Boolean(reason)
  );

  const event: RevenueEvent = {
    tenantId,
    source: "shopify",
    sourceEventId: line.sourceEventId,
    direction: "sale",
    occurredAt: line.occurredAt,
    grossAmountMinor: line.grossAmountMinor,
    currency: line.currency,
    quantity: line.quantity,
    workRef: line.workRef ?? undefined,
    contributorRefs: attribution.contributorRefs,
    costs: [...line.costs, ...costResult.costs],
    metadata: line.metadata,
  };

  // The attribution reason is not a hold: `resolveReferences` discovers the
  // same thing and words it better. Adding it here would duplicate it in the
  // review queue.
  const result = await ingestEvent(db, event, {
    holdForReview: holdReasons.length > 0 ? holdReasons.join(" ") : undefined,
  });

  return {
    sourceEventId: line.sourceEventId,
    lineItemId: line.lineItemId,
    status: result.status,
    eventId: result.eventId,
    totalAllocatedMinor: result.totalAllocatedMinor,
    reason: result.reviewReason ?? attribution.reason,
  };
}

// ============================================================
// Refunds and cancellations
// ============================================================

export interface ShopifyReversalOutcome {
  sourceEventId: string;
  lineItemId: number;
  status: "reversed" | "duplicate" | "nothing_to_reverse" | "unmatched";
  contributorImpactMinor: bigint;
  tenantAbsorbedMinor: bigint;
  reason?: string;
}

export interface ShopifyRefundIngestResult {
  refundId: number;
  orderId: number;
  reversals: ShopifyReversalOutcome[];
  totalContributorImpactMinor: bigint;
  totalTenantAbsorbedMinor: bigint;
  needsReview: string[];
}

/**
 * Load what the engine recorded as gross for each line of an order.
 *
 * The proportion of a refund is computed against *this*, not against anything
 * in the refund payload — see the note on `mapRefund`. Reading it back also
 * establishes which lines were ever ingested, so a refund naming a line we
 * never saw is reported rather than silently reversing nothing.
 */
async function loadOriginalGrosses(
  db: EngineDb,
  tenantId: string,
  orderId: number,
  lineItemIds: number[]
): Promise<Map<number, bigint>> {
  if (lineItemIds.length === 0) return new Map();

  const sourceEventIds = lineItemIds.map((id) => `${orderId}:${id}`);

  const rows = await db
    .select({
      sourceEventId: schema.revenueEvents.sourceEventId,
      grossAmountMinor: schema.revenueEvents.grossAmountMinor,
    })
    .from(schema.revenueEvents)
    .where(
      and(
        eq(schema.revenueEvents.tenantId, tenantId),
        eq(schema.revenueEvents.source, "shopify"),
        inArray(schema.revenueEvents.sourceEventId, sourceEventIds)
      )
    );

  const byLineItem = new Map<number, bigint>();
  for (const row of rows) {
    const lineItemId = Number(row.sourceEventId.split(":")[1]);
    if (Number.isFinite(lineItemId)) {
      byLineItem.set(lineItemId, BigInt(row.grossAmountMinor));
    }
  }

  return byLineItem;
}

export async function ingestShopifyRefund(
  db: EngineDb,
  refund: ShopifyRefund,
  options: { tenantId: string; currency: string }
): Promise<ShopifyRefundIngestResult> {
  const lineItemIds = (refund.refund_line_items ?? []).map((item) => item.line_item_id);
  const originals = await loadOriginalGrosses(
    db,
    options.tenantId,
    refund.order_id,
    lineItemIds
  );

  const { reversals, unmatched } = mapRefund(refund, originals, options.currency);

  const result: ShopifyRefundIngestResult = {
    refundId: refund.id,
    orderId: refund.order_id,
    reversals: [],
    totalContributorImpactMinor: 0n,
    totalTenantAbsorbedMinor: 0n,
    needsReview: [],
  };

  for (const item of unmatched) {
    result.reversals.push({
      sourceEventId: `refund:${refund.id}:${item.lineItemId}`,
      lineItemId: item.lineItemId,
      status: "unmatched",
      contributorImpactMinor: 0n,
      tenantAbsorbedMinor: 0n,
      reason: item.reason,
    });
    result.needsReview.push(item.reason);
  }

  for (const reversal of reversals) {
    const outcome = await reverseEvent(db, {
      tenantId: options.tenantId,
      source: "shopify",
      originalSourceEventId: reversal.reversesSourceEventId,
      reversalSourceEventId: reversal.sourceEventId,
      occurredAt: reversal.occurredAt,
      partialBasisPoints: reversal.partialBasisPoints,
      reason: reversal.reason,
    });

    result.reversals.push({
      sourceEventId: reversal.sourceEventId,
      lineItemId: reversal.lineItemId,
      status: outcome.status,
      contributorImpactMinor: outcome.contributorImpactMinor,
      tenantAbsorbedMinor: outcome.tenantAbsorbedMinor,
      reason: outcome.reviewReasons.join("; ") || undefined,
    });

    result.totalContributorImpactMinor += outcome.contributorImpactMinor;
    result.totalTenantAbsorbedMinor += outcome.tenantAbsorbedMinor;
    result.needsReview.push(...outcome.reviewReasons);
  }

  return result;
}

/**
 * Reverse everything ingested from an order that was cancelled.
 *
 * Reads back which lines were actually ingested rather than reversing every
 * line on the payload — a line that was held for review has no allocations, and
 * `reverseEvent` would correctly report nothing to reverse, but asking it about
 * a line that was never recorded at all throws.
 */
export async function ingestShopifyCancellation(
  db: EngineDb,
  order: ShopifyOrder,
  options: { tenantId: string }
): Promise<ShopifyRefundIngestResult> {
  const lineItemIds = (order.line_items ?? []).map((line) => line.id);
  const originals = await loadOriginalGrosses(db, options.tenantId, order.id, lineItemIds);

  const reversals = mapCancellation(order, [...originals.keys()]);

  const result: ShopifyRefundIngestResult = {
    refundId: 0,
    orderId: order.id,
    reversals: [],
    totalContributorImpactMinor: 0n,
    totalTenantAbsorbedMinor: 0n,
    needsReview: [],
  };

  for (const reversal of reversals) {
    const outcome = await reverseEvent(db, {
      tenantId: options.tenantId,
      source: "shopify",
      originalSourceEventId: reversal.reversesSourceEventId,
      reversalSourceEventId: reversal.sourceEventId,
      occurredAt: reversal.occurredAt,
      partialBasisPoints: 10000,
      reason: reversal.reason,
    });

    result.reversals.push({
      sourceEventId: reversal.sourceEventId,
      lineItemId: reversal.lineItemId,
      status: outcome.status,
      contributorImpactMinor: outcome.contributorImpactMinor,
      tenantAbsorbedMinor: outcome.tenantAbsorbedMinor,
    });

    result.totalContributorImpactMinor += outcome.contributorImpactMinor;
    result.totalTenantAbsorbedMinor += outcome.tenantAbsorbedMinor;
    result.needsReview.push(...outcome.reviewReasons);
  }

  return result;
}
