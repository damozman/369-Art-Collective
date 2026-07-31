/**
 * The Shopify mapper — every money decision in `map.ts`, against fixtures.
 *
 * This is the file that has to be right before a Partner account exists. When
 * real credentials land, the swap is `FixtureShopifyClient` → `LiveShopifyClient`
 * and nothing here changes; if these assertions still pass against a real
 * payload, the adapter works.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  apportionFee,
  extractWorkRef,
  lineDiscountMinor,
  lineGrossMinor,
  mapCancellation,
  mapOrder,
  mapRefund,
  orderOccurredAt,
  orderProcessingFeeMinor,
  ShopifyMappingError,
  type ShopifyMapConfig,
} from "../adapters/shopify/map";
import {
  discountedOrder,
  discountedOrderTransactions,
  halfRefundOnDiscountedLine,
  partialRefund,
  paypalOrder,
  paypalOrderTransactions,
  refundForUnknownLine,
  testModeOrder,
  twoLineOrder,
  twoLineOrderTransactions,
  unattributableOrder,
} from "../adapters/shopify/__fixtures__/orders";

const SKU_CONFIG: ShopifyMapConfig = {
  attribution: { from: "sku", pattern: "^ART-(\\d+)-" },
  feePolicy: "actual",
};

// ============================================================
// Gross
// ============================================================

test("gross is price times quantity, and excludes tax", () => {
  // $78.00 with $6.44 of tax on it. The tax belongs to the state, not to the
  // artist and not to the merchant.
  const line = twoLineOrder.line_items[0];
  assert.equal(lineGrossMinor(line, "USD"), 7800n);
});

test("quantity multiplies the unit price", () => {
  const line = paypalOrder.line_items[0]; // 2 × $25.00
  assert.equal(lineGrossMinor(line, "USD"), 5000n);
});

test("a cart-level discount code is deducted even though total_discount is zero", () => {
  // The bug this prevents: `total_discount` reads "0.00" while a 10% code took
  // $7.80 off. Reading it would pay the artist on the full $78.00 — money the
  // business never received.
  const line = discountedOrder.line_items[0];
  assert.equal(line.total_discount, "0.00");
  assert.equal(lineDiscountMinor(line, "USD"), 780n);
  assert.equal(lineGrossMinor(line, "USD"), 7020n);
});

test("discount_allocations wins over total_discount when both are present", () => {
  const line = {
    ...discountedOrder.line_items[0],
    total_discount: "99.00",
  };
  assert.equal(lineDiscountMinor(line, "USD"), 780n);
});

test("total_discount is used when there are no allocations", () => {
  const line = {
    ...twoLineOrder.line_items[0],
    total_discount: "5.00",
    discount_allocations: [],
  };
  assert.equal(lineDiscountMinor(line, "USD"), 500n);
});

test("a discount larger than the line floors gross at zero, never negative", () => {
  // A negative gross on a sale is rejected outright by validateRevenueEvent —
  // correctly — so producing one here would turn a data oddity into a crash.
  const line = {
    ...twoLineOrder.line_items[0],
    discount_allocations: [{ amount: "999.00" }],
  };
  assert.equal(lineGrossMinor(line, "USD"), 0n);
});

test("shop money is read, presentment money is ignored", () => {
  const line = {
    ...twoLineOrder.line_items[0],
    price: "78.00",
    price_set: {
      shop_money: { amount: "78.00", currency_code: "USD" },
      presentment_money: { amount: "71.50", currency_code: "EUR" },
    },
  };
  assert.equal(lineGrossMinor(line, "USD"), 7800n);
});

test("prices are parsed exactly, without a float in the path", () => {
  // parseFloat("1.005") * 100 is 100.49999999999999. The string parser is what
  // stops a cent disappearing unpredictably.
  const line = {
    ...twoLineOrder.line_items[0],
    price: "1.005",
    price_set: undefined,
    quantity: 1,
    discount_allocations: [],
    total_discount: "0.00",
  };
  assert.equal(lineGrossMinor(line, "USD"), 101n);
});

// ============================================================
// Dates
// ============================================================

test("the event is dated from when payment processed, not when the cart was submitted", () => {
  // Rules are effective-dated, so the wrong date can apply the wrong rate.
  const order = {
    ...twoLineOrder,
    created_at: "2026-02-28T23:50:00Z",
    processed_at: "2026-03-01T00:10:00Z",
  };
  assert.equal(orderOccurredAt(order).toISOString(), "2026-03-01T00:10:00.000Z");
});

test("created_at is the fallback when processed_at is absent", () => {
  const order = { ...twoLineOrder, processed_at: null };
  assert.equal(orderOccurredAt(order).toISOString(), "2026-03-14T14:12:44.000Z");
});

test("an unparseable date throws rather than becoming an Invalid Date row", () => {
  assert.throws(
    () => orderOccurredAt({ ...twoLineOrder, processed_at: "not a date" }),
    ShopifyMappingError
  );
});

// ============================================================
// Fees
// ============================================================

test("the fee comes from the transaction receipt, in major units", () => {
  assert.equal(orderProcessingFeeMinor(twoLineOrderTransactions, "USD"), 429n);
});

test("an authorization is not counted alongside the sale it became", () => {
  // Both transactions carry a 4.29 fee. Counting both would double the deduction.
  assert.equal(twoLineOrderTransactions.length, 2);
  assert.equal(orderProcessingFeeMinor(twoLineOrderTransactions, "USD"), 429n);
});

test("a gateway that reports no fee returns null, not zero", () => {
  // Zero and unknown are different answers, and only one of them is safe to
  // deduct nothing for.
  assert.equal(orderProcessingFeeMinor(paypalOrderTransactions, "USD"), null);
  assert.equal(orderProcessingFeeMinor([], "USD"), null);
});

test("a failed transaction's fee is ignored", () => {
  const failed = [
    { ...twoLineOrderTransactions[0], status: "failure" },
  ];
  assert.equal(orderProcessingFeeMinor(failed, "USD"), null);
});

test("the fee is apportioned across lines and the parts sum to exactly the fee", () => {
  const parts = apportionFee(429n, [7800n, 4000n]);
  assert.equal(parts.reduce((a, b) => a + b, 0n), 429n);
  // 429 × 78/118 = 283.6 → 284 after the remainder lands on the larger line.
  assert.deepEqual(parts, [284n, 145n]);
});

test("apportioning a fee across zero-gross lines still sums to the fee", () => {
  // A fully-discounted order can still carry a fixed 30c component, and it has
  // to land somewhere rather than being divided by zero.
  const parts = apportionFee(30n, [0n, 0n]);
  assert.equal(parts.reduce((a, b) => a + b, 0n), 30n);
});

// ============================================================
// Attribution
// ============================================================

test("the work reference is extracted from the SKU by pattern", () => {
  assert.equal(
    extractWorkRef(twoLineOrder.line_items[0], { from: "sku", pattern: "^ART-(\\d+)-" }),
    "1042"
  );
});

test("a SKU that does not match the pattern yields null, never the raw value", () => {
  // Falling back to the raw value would attribute a gift card to a work named
  // "GIFTCARD-25" if one ever existed.
  assert.equal(
    extractWorkRef(unattributableOrder.line_items[0], {
      from: "sku",
      pattern: "^ART-(\\d+)-",
    }),
    null
  );
});

test("every attribution source is readable", () => {
  const line = twoLineOrder.line_items[0];
  assert.equal(extractWorkRef(line, { from: "sku" }), "ART-1042-CANVAS-16X20");
  assert.equal(extractWorkRef(line, { from: "product_id" }), "900001");
  assert.equal(extractWorkRef(line, { from: "variant_id" }), "800001");
  assert.equal(
    extractWorkRef(line, { from: "line_item_property", property: "_artwork_id" }),
    "1042"
  );
});

test("a missing line-item property yields null rather than throwing", () => {
  assert.equal(
    extractWorkRef(twoLineOrder.line_items[0], {
      from: "line_item_property",
      property: "_not_present",
    }),
    null
  );
});

test("configuring property attribution without naming the property is a configuration error", () => {
  assert.throws(
    () => extractWorkRef(twoLineOrder.line_items[0], { from: "line_item_property" }),
    ShopifyMappingError
  );
});

// ============================================================
// Whole orders
// ============================================================

test("a two-line order becomes two events keyed on order and line", () => {
  // The marketplace keyed on the order alone and lost the second artwork of
  // every two-artwork order.
  const mapped = mapOrder(twoLineOrder, {
    config: SKU_CONFIG,
    transactions: twoLineOrderTransactions,
  });

  assert.equal(mapped.lines.length, 2);
  assert.deepEqual(
    mapped.lines.map((l) => l.sourceEventId),
    ["5001000001:12001", "5001000001:12002"]
  );
});

test("a mapped order carries gross, work reference and apportioned fee per line", () => {
  const mapped = mapOrder(twoLineOrder, {
    config: SKU_CONFIG,
    transactions: twoLineOrderTransactions,
  });

  const [first, second] = mapped.lines;

  assert.equal(first.grossAmountMinor, 7800n);
  assert.equal(first.workRef, "1042");
  assert.deepEqual(
    first.costs.map((c) => [c.type, c.amountMinor]),
    [["processing_fee", 284n]]
  );

  assert.equal(second.grossAmountMinor, 4000n);
  assert.equal(second.workRef, "2073");
  assert.deepEqual(
    second.costs.map((c) => [c.type, c.amountMinor]),
    [["processing_fee", 145n]]
  );

  assert.equal(first.holdReason, undefined);
  assert.equal(second.holdReason, undefined);
});

test("shipping charged to the customer is recorded but not deducted", () => {
  // What the customer paid for shipping and what shipping cost are different
  // numbers. Only the supplier knows the second.
  const mapped = mapOrder(twoLineOrder, {
    config: SKU_CONFIG,
    transactions: twoLineOrderTransactions,
  });

  assert.equal(mapped.lines[0].metadata.orderShippingCharged, "9.95");
  assert.ok(!mapped.lines[0].costs.some((c) => c.type === "shipping"));
});

test("a missing fee holds the line under the 'actual' policy", () => {
  // This is money decision 4. No guessed 2.9% + 30c anywhere.
  const mapped = mapOrder(paypalOrder, {
    config: SKU_CONFIG,
    transactions: paypalOrderTransactions,
  });

  assert.equal(mapped.lines.length, 1);
  assert.ok(mapped.lines[0].holdReason?.includes("Payment fee not reported"));
  assert.deepEqual(mapped.lines[0].costs, []);
});

test("transactions that could not be fetched at all also hold the line", () => {
  const mapped = mapOrder(twoLineOrder, { config: SKU_CONFIG, transactions: null });
  assert.ok(mapped.lines[0].holdReason?.includes("could not be read"));
});

test("the 'none' fee policy records no fee and holds nothing", () => {
  const mapped = mapOrder(paypalOrder, {
    config: { ...SKU_CONFIG, feePolicy: "none" },
    transactions: paypalOrderTransactions,
  });

  assert.equal(mapped.lines[0].holdReason, undefined);
  assert.deepEqual(mapped.lines[0].costs, []);
  assert.ok(mapped.warnings.some((w) => w.includes("absorbed")));
});

test("an unattributable line is held, with the reason naming where we looked", () => {
  const mapped = mapOrder(unattributableOrder, {
    config: { ...SKU_CONFIG, feePolicy: "none" },
    transactions: [],
  });

  assert.equal(mapped.lines.length, 1);
  assert.equal(mapped.lines[0].workRef, null);
  assert.ok(mapped.lines[0].holdReason?.includes("sku"));
});

test("both hold reasons survive when a line is unattributable AND has no fee", () => {
  // Fixing one and allocating would pay on an assumed-zero fee.
  const mapped = mapOrder(unattributableOrder, { config: SKU_CONFIG, transactions: null });
  const reason = mapped.lines[0].holdReason ?? "";
  assert.ok(reason.includes("Payment fee"));
  assert.ok(reason.includes("work reference"));
});

test("a Shopify test order produces no events at all", () => {
  const mapped = mapOrder(testModeOrder, {
    config: SKU_CONFIG,
    transactions: twoLineOrderTransactions,
  });

  assert.equal(mapped.lines.length, 0);
  assert.equal(mapped.skipped.length, 2);
  assert.ok(mapped.warnings.some((w) => w.includes("Test order")));
});

test("test orders are ingestible when a harness explicitly allows them", () => {
  const mapped = mapOrder(testModeOrder, {
    config: { ...SKU_CONFIG, allowTestOrders: true },
    transactions: twoLineOrderTransactions,
  });
  assert.equal(mapped.lines.length, 2);
});

test("a zero-quantity line is skipped rather than becoming a zero event", () => {
  const order = {
    ...twoLineOrder,
    line_items: [{ ...twoLineOrder.line_items[0], quantity: 0 }],
  };
  const mapped = mapOrder(order, { config: SKU_CONFIG, transactions: [] });
  assert.equal(mapped.lines.length, 0);
  assert.equal(mapped.skipped[0].reason, "Zero quantity");
});

test("a line in a different currency to its order throws rather than mixing", () => {
  const order = {
    ...twoLineOrder,
    line_items: [
      {
        ...twoLineOrder.line_items[0],
        price_set: {
          shop_money: { amount: "78.00", currency_code: "EUR" },
        },
      },
    ],
  };
  assert.throws(
    () => mapOrder(order, { config: SKU_CONFIG, transactions: [] }),
    ShopifyMappingError
  );
});

test("the discounted order's fee apportions over discounted gross, not list price", () => {
  const mapped = mapOrder(discountedOrder, {
    config: SKU_CONFIG,
    transactions: discountedOrderTransactions,
  });

  assert.deepEqual(
    mapped.lines.map((l) => l.grossAmountMinor),
    [7020n, 3600n]
  );

  const fees = mapped.lines.map(
    (l) => l.costs.find((c) => c.type === "processing_fee")?.amountMinor ?? 0n
  );
  assert.equal(fees.reduce((a, b) => a + b, 0n), 365n);
});

// ============================================================
// Refunds
// ============================================================

test("a full-line refund is exactly 10000 basis points", () => {
  // Anything else leaves a stray cent on the ledger forever.
  const { reversals } = mapRefund(partialRefund, new Map([[12001, 7800n]]), "USD");

  assert.equal(reversals.length, 1);
  assert.equal(reversals[0].partialBasisPoints, 10000);
  assert.equal(reversals[0].sourceEventId, "refund:66001:12001");
  assert.equal(reversals[0].reversesSourceEventId, "5001000001:12001");
  assert.equal(reversals[0].reason, "Damaged in transit");
});

test("a partial refund on a discounted line divides by what was earned, not list price", () => {
  // $35.10 of a line that sold for $70.20 after discount is half. Against the
  // $78.00 list price it would read as 45% and under-recover by 5% of the
  // artist's share — money that never comes back.
  const { reversals } = mapRefund(
    halfRefundOnDiscountedLine,
    new Map([[12010, 7020n]]),
    "USD"
  );

  assert.equal(reversals[0].partialBasisPoints, 5000);
});

test("a refund larger than the recorded gross caps at 100%", () => {
  const { reversals } = mapRefund(partialRefund, new Map([[12001, 5000n]]), "USD");
  assert.equal(reversals[0].partialBasisPoints, 10000);
});

test("a refund for a line that was never ingested is reported, not crashed on", () => {
  const { reversals, unmatched } = mapRefund(refundForUnknownLine, new Map(), "USD");
  assert.equal(reversals.length, 0);
  assert.equal(unmatched.length, 1);
  assert.ok(unmatched[0].reason.includes("never ingested"));
});

test("a zero-value refund line reverses nothing", () => {
  const restock = {
    ...partialRefund,
    refund_line_items: [
      { ...partialRefund.refund_line_items[0], subtotal: "0.00", subtotal_set: undefined },
    ],
  };
  const { reversals, unmatched } = mapRefund(restock, new Map([[12001, 7800n]]), "USD");
  assert.equal(reversals.length, 0);
  assert.equal(unmatched.length, 0);
});

test("a refund of a fully-discounted line is treated as a full reversal", () => {
  const { reversals } = mapRefund(partialRefund, new Map([[12001, 0n]]), "USD");
  assert.equal(reversals[0].partialBasisPoints, 10000);
});

test("a cancellation reverses every ingested line in full", () => {
  const reversals = mapCancellation(
    { ...twoLineOrder, cancelled_at: "2026-03-25T12:00:00Z" },
    [12001, 12002]
  );

  assert.equal(reversals.length, 2);
  assert.deepEqual(
    reversals.map((r) => r.sourceEventId),
    ["cancel:5001000001:12001", "cancel:5001000001:12002"]
  );
  assert.ok(reversals.every((r) => r.partialBasisPoints === 10000));
});

test("a cancellation and a refund of the same line use different keys", () => {
  // Both can fire for one cancelled-and-refunded order. Different keys mean
  // neither is silently swallowed as a duplicate of the other; the engine's
  // "nothing to reverse" answer is what stops the second double-counting.
  const cancels = mapCancellation({ ...twoLineOrder, cancelled_at: "2026-03-25T12:00:00Z" }, [
    12001,
  ]);
  const { reversals } = mapRefund(partialRefund, new Map([[12001, 7800n]]), "USD");

  assert.notEqual(cancels[0].sourceEventId, reversals[0].sourceEventId);
  assert.equal(cancels[0].reversesSourceEventId, reversals[0].reversesSourceEventId);
});
