/**
 * Shopify payload → canonical `RevenueEvent` inputs. Pure, clock-free.
 *
 * This module is the first half of §4's ingestion seam. It contains every
 * decision about what a Shopify order *means* financially, and no database
 * access, no network, and no `Date.now()`. That separation is why the money
 * decisions below can be tested exhaustively against fixtures instead of
 * against a live store we cannot reach from a sandbox.
 *
 * ────────────────────────────────────────────────────────────────────────
 * THE FIVE MONEY DECISIONS, AND WHY EACH IS THE WAY IT IS
 * ────────────────────────────────────────────────────────────────────────
 *
 * 1. **One event per line item, keyed `${orderId}:${lineItemId}`.** The
 *    marketplace keyed on the order alone and silently lost the second artwork
 *    of every two-artwork order. The pair is the idempotency key (§5 #8), so a
 *    re-delivered webhook is a no-op and a two-line order is two events.
 *
 * 2. **Gross is `price × quantity − discounts`. Tax is excluded.** Sales tax is
 *    collected on behalf of a tax authority and remitted to it; it was never
 *    the merchant's revenue and paying a contributor a share of it means paying
 *    them out of the merchant's own pocket. Discounts *are* deducted, because a
 *    20%-off sale genuinely earned 20% less — charging the discount entirely to
 *    the merchant would be a different deal, and one nobody agreed to.
 *
 * 3. **Shipping charged to the customer is not line revenue.** What the
 *    customer paid for shipping and what shipping cost the merchant are
 *    different numbers, and only the supplier knows the second. Customer-paid
 *    shipping is recorded in metadata for reconciliation; the shipping *cost*
 *    arrives from a `LineCostSource`, not from Shopify.
 *
 * 4. **The payment processing fee is fetched, never assumed, and always
 *    recorded when it can be read.** Shopify does not put it in the order
 *    webhook — it is on the order's transactions, and only for Shopify
 *    Payments. A guessed "2.9% + 30¢" is exactly the invented-cost bug Phase 0
 *    spent its time removing, so there is no guess here.
 *
 *    NOTE WHAT IS *NOT* DECIDED HERE: whether the fee reduces a contributor's
 *    share. That is the rule's business — `splitRules.costDeductions` already
 *    names which cost types a given deal deducts, per contributor and
 *    effective-dated. Adding a second absorb/deduct switch at the connection
 *    level would let the two disagree, and would also erase the fee from the
 *    tenant's own margin reporting when set to "absorb". The adapter's only job
 *    is to find the number; the rule decides what it means.
 *
 *    The one genuine choice is what to do when the fee *cannot* be found —
 *    PayPal and most non-Shopify-Payments gateways do not report one. See
 *    `onUnknownFee`.
 *
 * 5. **Test orders never produce events.** Shopify's test mode issues real-
 *    looking orders with `test: true`. One of those reaching a real ledger
 *    creates a real payable balance, and the fix is a manual adjustment.
 *
 * ────────────────────────────────────────────────────────────────────────
 * WHAT THIS MODULE DOES NOT DO
 * ────────────────────────────────────────────────────────────────────────
 *
 * It does not resolve contributors. Shopify has no idea who is owed money; the
 * engine does, through `works` and `work_contributors`. The mapper produces a
 * `workRef` and the DB-facing half (`ingest.ts`) expands it into contributor
 * references. Keeping that split is what lets every rule above be tested with
 * no database at all.
 */

import { allocate, parseDecimalToMinor } from "../../money";
import type { CostInput } from "../../revenue-event";
import type {
  ShopifyLineItem,
  ShopifyMoneySet,
  ShopifyOrder,
  ShopifyRefund,
  ShopifyTransaction,
} from "./types";

// ============================================================
// Configuration
// ============================================================

/**
 * Where the reference that identifies a work comes from.
 *
 * Configurable per connection because it genuinely differs: a print-on-demand
 * store encodes the artwork in the SKU, a label uses the product id, and a
 * store that sells bundles hides it in a line-item property. Guessing wrong
 * means every sale lands in the review queue, which is loud and recoverable —
 * unlike guessing a price, which is quiet and is not.
 */
export type WorkRefSource = "sku" | "variant_id" | "product_id" | "line_item_property";

export interface ShopifyAttributionConfig {
  from: WorkRefSource;
  /** Property name to read when `from` is `line_item_property`. */
  property?: string;
  /**
   * Optional regex with exactly one capture group, applied to the raw value.
   * `^ART-(\d+)-` turns `ART-1042-CANVAS-16X20` into `1042`. Applied after
   * extraction; a non-match holds the line rather than falling back to the raw
   * value, because a silent fallback attributes revenue to the wrong work.
   */
  pattern?: string;
}

/**
 * What to do when the payment fee cannot be determined. See money decision 4.
 *
 * This is NOT "deduct or absorb" — that lives on the rule, per deal. This is
 * the narrower question of what to do about a sale whose fee the gateway never
 * reported, where there is genuinely no right answer:
 *
 * `hold`    — record the sale, allocate nothing, put it in the review queue.
 *             Correct, and noisy on stores that take PayPal.
 * `proceed` — allocate with no fee recorded. Any rule that deducts
 *             `processing_fee` simply finds none, so the tenant absorbs it for
 *             that sale. Quiet, and means two identical sales can pay slightly
 *             differently depending on how the customer paid.
 *
 * Both are defensible; neither invents a number. The default is `hold` because
 * a held sale is recoverable and an overpaid one is not.
 */
export type UnknownFeePolicy = "hold" | "proceed";

export interface ShopifyMapConfig {
  attribution: ShopifyAttributionConfig;
  onUnknownFee: UnknownFeePolicy;
  /** Ingest Shopify test-mode orders. Only ever true in a test harness. */
  allowTestOrders?: boolean;
}

// ============================================================
// Output
// ============================================================

/** One line item, normalized. Not yet a `RevenueEvent` — no contributors yet. */
export interface MappedLine {
  sourceEventId: string;
  lineItemId: number;
  workRef: string | null;
  grossAmountMinor: bigint;
  currency: string;
  quantity: number;
  occurredAt: Date;
  costs: CostInput[];
  metadata: Record<string, unknown>;
  /**
   * Set when the line must be recorded but not allocated. The revenue is real
   * and gets a row; nobody is paid from it until a human resolves the reason.
   */
  holdReason?: string;
}

export interface MappedOrder {
  orderId: number;
  orderName: string | null;
  currency: string;
  occurredAt: Date;
  lines: MappedLine[];
  /** Lines deliberately not turned into events, with the reason. */
  skipped: Array<{ lineItemId: number; reason: string }>;
  /** Order-level notes worth surfacing but not worth holding money over. */
  warnings: string[];
}

export class ShopifyMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShopifyMappingError";
  }
}

// ============================================================
// Small readers
// ============================================================

/**
 * Read shop-currency money from a `*_set` field, falling back to the flat one.
 *
 * The flat field (`line_item.price`) is always in shop currency, so the
 * fallback is safe — but the `_set` form is preferred because Shopify has been
 * gradually moving to it and the flat fields are the ones that get deprecated.
 */
function shopMoney(set: ShopifyMoneySet | undefined, flat: string | undefined): string | null {
  if (set?.shop_money?.amount != null) return set.shop_money.amount;
  if (flat != null) return flat;
  return null;
}

function shopCurrency(set: ShopifyMoneySet | undefined): string | null {
  return set?.shop_money?.currency_code ?? null;
}

/**
 * The date an order counts as earned.
 *
 * `processed_at` is when payment completed; `created_at` is when the cart was
 * submitted. They differ for manual-capture and offline payments, sometimes by
 * days — and because rules are effective-dated (§5 #5), picking the wrong one
 * can apply last month's rate. Payment is the event that matters.
 */
export function orderOccurredAt(order: ShopifyOrder): Date {
  const raw = order.processed_at || order.created_at;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new ShopifyMappingError(
      `Order ${order.id} has an unparseable date: ${JSON.stringify(raw)}`
    );
  }
  return date;
}

// ============================================================
// Attribution
// ============================================================

/**
 * Extract the work reference from a line item.
 *
 * Returns `null` when the configured source is absent or the pattern does not
 * match. `null` becomes a held line, never a guess.
 */
export function extractWorkRef(
  line: ShopifyLineItem,
  config: ShopifyAttributionConfig
): string | null {
  let raw: string | null = null;

  switch (config.from) {
    case "sku":
      raw = line.sku ?? null;
      break;
    case "variant_id":
      raw = line.variant_id != null ? String(line.variant_id) : null;
      break;
    case "product_id":
      raw = line.product_id != null ? String(line.product_id) : null;
      break;
    case "line_item_property": {
      if (!config.property) {
        throw new ShopifyMappingError(
          "attribution.from is 'line_item_property' but no property name is configured"
        );
      }
      const match = (line.properties ?? []).find((p) => p.name === config.property);
      raw = match?.value ?? null;
      break;
    }
    default:
      throw new ShopifyMappingError(`Unknown attribution source ${String(config.from)}`);
  }

  if (raw == null) return null;
  raw = raw.trim();
  if (raw === "") return null;

  if (!config.pattern) return raw;

  const matched = new RegExp(config.pattern).exec(raw);
  if (!matched) return null;

  // Group 1 when the pattern captures, whole match when it does not. A pattern
  // that captures nothing is a filter rather than an extractor, which is a
  // legitimate thing to want.
  return matched[1] ?? matched[0];
}

// ============================================================
// Line arithmetic
// ============================================================

/**
 * Total discount applied to one line, in minor units.
 *
 * `discount_allocations` is authoritative — it is how Shopify reports order-
 * level discounts pushed down onto lines, and a 10%-off-everything code appears
 * there and *not* in `total_discount`. Falling back to `total_discount` alone
 * would overpay on every order that used a cart-level code.
 */
export function lineDiscountMinor(line: ShopifyLineItem, currency: string): bigint {
  const allocations = line.discount_allocations ?? [];

  if (allocations.length > 0) {
    return allocations.reduce((sum, allocation) => {
      const amount = shopMoney(allocation.amount_set, allocation.amount);
      if (amount == null) return sum;
      return sum + parseDecimalToMinor(amount, currency);
    }, 0n);
  }

  const legacy = shopMoney(line.total_discount_set, line.total_discount);
  return legacy == null ? 0n : parseDecimalToMinor(legacy, currency);
}

/**
 * Gross revenue for one line: unit price × quantity, less discounts, before tax.
 *
 * Floors at zero. A discount larger than the line total is a data oddity rather
 * than negative revenue, and a negative gross on a `sale` is rejected outright
 * by `validateRevenueEvent` — correctly, since a sale that reduces what someone
 * is owed should be recorded as a reversal referencing the original.
 */
export function lineGrossMinor(line: ShopifyLineItem, currency: string): bigint {
  const unit = shopMoney(line.price_set, line.price);
  if (unit == null) {
    throw new ShopifyMappingError(`Line item ${line.id} has no price`);
  }

  const gross = parseDecimalToMinor(unit, currency) * BigInt(line.quantity);
  const discount = lineDiscountMinor(line, currency);
  const net = gross - discount;

  return net < 0n ? 0n : net;
}

// ============================================================
// Processing fees
// ============================================================

/**
 * Total payment processing fee for an order, from its transactions.
 *
 * Returns `null` when no fee is discoverable — which is the normal, expected
 * answer for PayPal, manual payments, and most non-Shopify-Payments gateways,
 * not an error. The caller decides what a `null` means; see `onUnknownFee`.
 *
 * Sums successful sale and capture transactions only. Refund transactions carry
 * their own fee treatment and are handled on the reversal path, and counting a
 * refund's fee here would deduct it twice.
 */
export function orderProcessingFeeMinor(
  transactions: ShopifyTransaction[],
  currency: string
): bigint | null {
  let total = 0n;
  let found = false;

  for (const transaction of transactions) {
    if (transaction.status !== "success") continue;
    if (transaction.kind !== "sale" && transaction.kind !== "capture") continue;

    const fee = transaction.receipt?.balance_transaction?.fee;
    if (fee == null) continue;

    // Shopify surfaces the gateway's own receipt verbatim, so the fee arrives
    // in MAJOR units (Stripe's `fee` is in minor units, but Shopify's copy of
    // it is not). It is a number as often as a string, and a number is a float
    // — hence `String(fee)` into the exact string parser rather than any
    // arithmetic on the number itself.
    total += parseDecimalToMinor(String(fee), currency);
    found = true;
  }

  return found ? total : null;
}

/**
 * Spread an order-level fee across its lines in proportion to gross.
 *
 * Largest-remainder, so the parts sum to exactly the fee — no cent invented,
 * none lost. The 30¢ fixed component of a card fee therefore lands wholly on
 * one line rather than being split into fractions that round away.
 */
export function apportionFee(feeMinor: bigint, lineGrosses: bigint[]): bigint[] {
  return allocate(feeMinor, lineGrosses);
}

// ============================================================
// Orders
// ============================================================

export interface MapOrderOptions {
  config: ShopifyMapConfig;
  /**
   * The order's transactions, when they were fetched. `null` means "not
   * available" and is distinct from `[]`, which means "fetched, and there were
   * none" — the first is subject to `onUnknownFee`, the second is a
   * genuine zero.
   */
  transactions?: ShopifyTransaction[] | null;
}

/**
 * Map a paid Shopify order into per-line inputs.
 *
 * Throws only on payloads that are structurally unusable. Everything a human
 * could reasonably need to fix — an unattributable SKU, an unavailable fee —
 * becomes a `holdReason` on the line, so the revenue is recorded and visible
 * rather than dropped on the floor.
 */
export function mapOrder(order: ShopifyOrder, options: MapOrderOptions): MappedOrder {
  const { config } = options;
  const warnings: string[] = [];
  const skipped: Array<{ lineItemId: number; reason: string }> = [];

  if (order.test && !config.allowTestOrders) {
    return {
      orderId: order.id,
      orderName: order.name ?? null,
      currency: order.currency,
      occurredAt: orderOccurredAt(order),
      lines: [],
      skipped: (order.line_items ?? []).map((line) => ({
        lineItemId: line.id,
        reason: "Shopify test order",
      })),
      warnings: ["Test order — no events created"],
    };
  }

  const currency = order.currency;
  if (!currency) {
    throw new ShopifyMappingError(`Order ${order.id} has no currency`);
  }

  // Every line must agree with the order on currency. Shopify does not mix
  // them, but a payload that did would otherwise produce a ledger where two
  // amounts in different currencies are summed as if they were the same.
  for (const line of order.line_items ?? []) {
    const lineCurrency = shopCurrency(line.price_set);
    if (lineCurrency && lineCurrency !== currency) {
      throw new ShopifyMappingError(
        `Order ${order.id} is in ${currency} but line ${line.id} is in ${lineCurrency}`
      );
    }
  }

  const occurredAt = orderOccurredAt(order);

  const billable = (order.line_items ?? []).filter((line) => {
    if (line.quantity <= 0) {
      skipped.push({ lineItemId: line.id, reason: "Zero quantity" });
      return false;
    }
    return true;
  });

  const grosses = billable.map((line) => lineGrossMinor(line, currency));

  // ---- Fees ----
  //
  // Always attempted. The fee is real money leaving the business and belongs in
  // its records whether or not any contributor's deal deducts it — that
  // question is settled later, by the rule.
  let feeParts: bigint[] = billable.map(() => 0n);
  let missingFeeReason: string | null = null;
  let feeSource: string | null = null;

  if (options.transactions == null) {
    missingFeeReason =
      "Payment fee not available — the order's transactions could not be read. " +
      "Nobody is paid on an assumed fee.";
  } else {
    const fee = orderProcessingFeeMinor(options.transactions, currency);
    if (fee == null) {
      missingFeeReason =
        "Payment fee not reported by the payment gateway (common for PayPal and " +
        "similar). Record it manually, or set this store to carry on without it.";
    } else {
      feeParts = apportionFee(fee, grosses);
      feeSource = "shopify_transactions";
    }
  }

  const feeHoldReason =
    missingFeeReason && config.onUnknownFee === "hold" ? missingFeeReason : null;

  const shippingCharged = shopMoney(order.total_shipping_price_set, undefined);

  const lines: MappedLine[] = billable.map((line, index) => {
    const workRef = extractWorkRef(line, config.attribution);

    const costs: CostInput[] = [];
    if (feeSource && feeParts[index] > 0n) {
      costs.push({
        type: "processing_fee",
        amountMinor: feeParts[index],
        currency,
        source: feeSource,
        resolvedAt: occurredAt,
      });
    }

    const holdReasons: string[] = [];
    if (feeHoldReason) holdReasons.push(feeHoldReason);
    if (!workRef) {
      holdReasons.push(
        `Could not read a work reference from this line (looking at ` +
          `${config.attribution.from}${config.attribution.pattern ? ` via /${config.attribution.pattern}/` : ""}).`
      );
    }

    return {
      sourceEventId: `${order.id}:${line.id}`,
      lineItemId: line.id,
      workRef,
      grossAmountMinor: grosses[index],
      currency,
      quantity: line.quantity,
      occurredAt,
      costs,
      metadata: {
        shopifyOrderId: order.id,
        shopifyOrderName: order.name ?? null,
        shopifyLineItemId: line.id,
        shopifyProductId: line.product_id,
        shopifyVariantId: line.variant_id,
        sku: line.sku,
        title: line.title,
        variantTitle: line.variant_title ?? null,
        vendor: line.vendor ?? null,
        unitPrice: shopMoney(line.price_set, line.price),
        discountMinor: lineDiscountMinor(line, currency).toString(),
        // Recorded, not deducted — see money decision 3.
        orderShippingCharged: shippingCharged,
        financialStatus: order.financial_status ?? null,
      },
      holdReason: holdReasons.length > 0 ? holdReasons.join(" ") : undefined,
    };
  });

  if (missingFeeReason && !feeHoldReason) {
    warnings.push(
      "No payment fee could be read for this order and the store is set to carry " +
        "on without one — the business absorbs it for these lines"
    );
  }

  return {
    orderId: order.id,
    orderName: order.name ?? null,
    currency,
    occurredAt,
    lines,
    skipped,
    warnings,
  };
}

// ============================================================
// Refunds
// ============================================================

export interface MappedReversal {
  /** Idempotency key for the reversal itself. */
  sourceEventId: string;
  /** The `sourceEventId` of the sale being reversed. */
  reversesSourceEventId: string;
  lineItemId: number;
  refundedMinor: bigint;
  currency: string;
  quantity: number;
  occurredAt: Date;
  /**
   * Proportion of the original line being reversed, in basis points. Fed to
   * `reverseEvent`, which negates the *original* allocations by this fraction
   * rather than recomputing from today's rules.
   */
  partialBasisPoints: number;
  reason: string;
  metadata: Record<string, unknown>;
}

export function refundOccurredAt(refund: ShopifyRefund): Date {
  const raw = refund.processed_at || refund.created_at;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new ShopifyMappingError(
      `Refund ${refund.id} has an unparseable date: ${JSON.stringify(raw)}`
    );
  }
  return date;
}

/**
 * Map a refund into per-line reversals.
 *
 * `originalGrossByLineItemId` is what the engine recorded at sale time, and the
 * proportion is computed against *that* rather than against anything in the
 * refund payload. The difference matters: Shopify's `subtotal` on a refund line
 * is net of that line's share of discounts, and dividing it by the undiscounted
 * price would claw back less than was paid out on a discounted order — money
 * that never comes back.
 *
 * A refund of the full original gross yields exactly 10000 basis points, so a
 * full refund reverses the allocation exactly and leaves no stray cent.
 */
export function mapRefund(
  refund: ShopifyRefund,
  originalGrossByLineItemId: Map<number, bigint>,
  currency: string
): { reversals: MappedReversal[]; unmatched: Array<{ lineItemId: number; reason: string }> } {
  const occurredAt = refundOccurredAt(refund);
  const reversals: MappedReversal[] = [];
  const unmatched: Array<{ lineItemId: number; reason: string }> = [];

  for (const item of refund.refund_line_items ?? []) {
    const original = originalGrossByLineItemId.get(item.line_item_id);

    if (original === undefined) {
      unmatched.push({
        lineItemId: item.line_item_id,
        reason:
          `Refund references line ${item.line_item_id} of order ${refund.order_id}, ` +
          "which was never ingested as a sale",
      });
      continue;
    }

    const refundedRaw = shopMoney(item.subtotal_set, item.subtotal);
    if (refundedRaw == null) {
      unmatched.push({
        lineItemId: item.line_item_id,
        reason: `Refund line ${item.id} has no subtotal`,
      });
      continue;
    }

    const refundedMinor = parseDecimalToMinor(refundedRaw, currency);

    if (refundedMinor <= 0n) {
      // A zero-value refund line is a restock with no money moved. Reversing
      // nothing is the correct outcome, not an error.
      continue;
    }

    let basisPoints: number;
    if (original <= 0n) {
      // The sale was fully discounted, so there is no proportion to take. Treat
      // it as a full reversal: there is nothing to claw back either way, and
      // 100% keeps the event's own arithmetic consistent.
      basisPoints = 10000;
    } else if (refundedMinor >= original) {
      basisPoints = 10000;
    } else {
      // Round to nearest, half away from zero, so a half-refund of an odd
      // amount does not systematically favour one side.
      basisPoints = Number((refundedMinor * 10000n + original / 2n) / original);
    }

    reversals.push({
      sourceEventId: `refund:${refund.id}:${item.line_item_id}`,
      reversesSourceEventId: `${refund.order_id}:${item.line_item_id}`,
      lineItemId: item.line_item_id,
      refundedMinor,
      currency,
      quantity: item.quantity,
      occurredAt,
      partialBasisPoints: basisPoints,
      reason: refund.note?.trim() || `Shopify refund ${refund.id}`,
      metadata: {
        shopifyRefundId: refund.id,
        shopifyOrderId: refund.order_id,
        shopifyLineItemId: item.line_item_id,
        refundedSubtotal: refundedRaw,
        originalGrossMinor: original.toString(),
      },
    });
  }

  return { reversals, unmatched };
}

/**
 * Map a cancelled order into full reversals of everything ingested from it.
 *
 * A cancellation with a refund also fires `refunds/create`; the two produce
 * different `sourceEventId`s and would otherwise reverse the same sale twice.
 * The engine's uniqueness constraint stops the second from being written, which
 * is why cancellation reversals are keyed on the order and refund reversals on
 * the refund — both idempotent, neither able to double-count the other because
 * `reverseEvent` refuses to reverse an event whose allocations are already gone.
 */
export function mapCancellation(
  order: ShopifyOrder,
  ingestedLineItemIds: number[]
): MappedReversal[] {
  const occurredAt = new Date(order.cancelled_at ?? order.created_at);
  if (Number.isNaN(occurredAt.getTime())) {
    throw new ShopifyMappingError(`Order ${order.id} has an unparseable cancellation date`);
  }

  return ingestedLineItemIds.map((lineItemId) => ({
    sourceEventId: `cancel:${order.id}:${lineItemId}`,
    reversesSourceEventId: `${order.id}:${lineItemId}`,
    lineItemId,
    refundedMinor: 0n,
    currency: order.currency,
    quantity: 0,
    occurredAt,
    partialBasisPoints: 10000,
    reason: `Shopify order ${order.name ?? order.id} cancelled`,
    metadata: {
      shopifyOrderId: order.id,
      shopifyLineItemId: lineItemId,
      cancelledAt: order.cancelled_at ?? null,
    },
  }));
}
