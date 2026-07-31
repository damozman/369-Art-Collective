/**
 * Shopify payload fixtures.
 *
 * UNLIKE THE PRINTIFY COST FIXTURES, THESE ARE NOT INVENTED NUMBERS THAT COULD
 * PAY SOMEBODY. A Printify fixture stands in for a *price* — get it wrong and a
 * real contributor is paid a wrong amount from it. These fixtures stand in for
 * a *payload shape* — get it wrong and the mapper fails loudly against the real
 * API the first time it runs. The prices below are arbitrary on purpose; what
 * has to be faithful is the structure, and specifically the four places
 * Shopify's structure is surprising:
 *
 *   1. `discount_allocations` carries order-level discounts pushed onto lines,
 *      while `total_discount` does not. `discountedOrder` has both so the
 *      mapper's preference for the former is actually exercised.
 *   2. Money appears twice, as a flat string and inside a `*_set` — and the
 *      `_set` has presentment money that must never be read.
 *   3. The payment fee is on the transaction receipt in MAJOR units, and is
 *      absent entirely for non-Shopify-Payments gateways.
 *   4. A refund's `subtotal` is already net of that line's discount.
 *
 * When a real payload is captured from a live store, diff it against these and
 * fix the fixture rather than the mapper.
 */

import type {
  ShopifyOrder,
  ShopifyRefund,
  ShopifyTransaction,
} from "../types";

/**
 * The ordinary case: two lines, no discount, Shopify Payments.
 *
 * $118.00 of goods across two lines ($78.00 + $40.00), $9.95 shipping, $9.74
 * tax. The fee is $3.72 — 2.9% of $118.00 plus one 30¢ fixed component — which
 * is the same worked example the marketplace's own apportionment was reconciled
 * against by hand, so the two can be compared.
 */
export const twoLineOrder: ShopifyOrder = {
  id: 5001000001,
  name: "#1042",
  order_number: 1042,
  created_at: "2026-03-14T09:12:44-05:00",
  processed_at: "2026-03-14T09:13:02-05:00",
  currency: "USD",
  presentment_currency: "USD",
  financial_status: "paid",
  test: false,
  total_price: "137.69",
  subtotal_price: "118.00",
  total_tax: "9.74",
  total_discounts: "0.00",
  total_shipping_price_set: {
    shop_money: { amount: "9.95", currency_code: "USD" },
    presentment_money: { amount: "9.95", currency_code: "USD" },
  },
  line_items: [
    {
      id: 12001,
      product_id: 900001,
      variant_id: 800001,
      sku: "ART-1042-CANVAS-16X20",
      title: "Desert Bloom",
      variant_title: "Canvas / 16x20",
      vendor: "369 Art Collective",
      quantity: 1,
      price: "78.00",
      price_set: {
        shop_money: { amount: "78.00", currency_code: "USD" },
        presentment_money: { amount: "78.00", currency_code: "USD" },
      },
      total_discount: "0.00",
      discount_allocations: [],
      tax_lines: [{ title: "State Tax", price: "6.44", rate: 0.0825 }],
      properties: [{ name: "_artwork_id", value: "1042" }],
      fulfillable_quantity: 1,
    },
    {
      id: 12002,
      product_id: 900002,
      variant_id: 800002,
      sku: "ART-2073-PRINT-11X14",
      title: "Night Arroyo",
      variant_title: "Fine Art Print / 11x14",
      vendor: "369 Art Collective",
      quantity: 1,
      price: "40.00",
      price_set: {
        shop_money: { amount: "40.00", currency_code: "USD" },
        presentment_money: { amount: "40.00", currency_code: "USD" },
      },
      total_discount: "0.00",
      discount_allocations: [],
      tax_lines: [{ title: "State Tax", price: "3.30", rate: 0.0825 }],
      properties: [{ name: "_artwork_id", value: "2073" }],
      fulfillable_quantity: 1,
    },
  ],
};

/** Shopify Payments transactions for `twoLineOrder`. Fee in MAJOR units. */
export const twoLineOrderTransactions: ShopifyTransaction[] = [
  {
    id: 77001,
    order_id: 5001000001,
    kind: "sale",
    status: "success",
    gateway: "shopify_payments",
    amount: "137.69",
    currency: "USD",
    processed_at: "2026-03-14T09:13:02-05:00",
    receipt: {
      balance_transaction: {
        // 2.9% of 137.69 + 0.30. Shopify charges on the total collected,
        // including tax and shipping — which is why the apportionment below
        // spreads it across lines by gross rather than trying to derive it.
        fee: 4.29,
        currency: "USD",
        net: 133.4,
      },
    },
  },
  {
    // An authorization that was captured. Only `sale` and `capture` count, and
    // this one is here to prove an authorization is not double-counted.
    id: 77000,
    order_id: 5001000001,
    kind: "authorization",
    status: "success",
    gateway: "shopify_payments",
    amount: "137.69",
    currency: "USD",
    processed_at: "2026-03-14T09:12:50-05:00",
    receipt: { balance_transaction: { fee: 4.29, currency: "USD" } },
  },
];

/**
 * A cart-level discount code, which lands in `discount_allocations` only.
 *
 * `total_discount` is "0.00" on both lines while a 10% code took $11.80 off the
 * order. A mapper that reads `total_discount` sees full price and overpays.
 */
export const discountedOrder: ShopifyOrder = {
  id: 5001000002,
  name: "#1043",
  created_at: "2026-03-15T14:02:00-05:00",
  processed_at: "2026-03-15T14:02:11-05:00",
  currency: "USD",
  financial_status: "paid",
  total_price: "115.62",
  subtotal_price: "106.20",
  total_tax: "8.76",
  total_discounts: "11.80",
  total_shipping_price_set: {
    shop_money: { amount: "0.66", currency_code: "USD" },
  },
  line_items: [
    {
      id: 12010,
      product_id: 900001,
      variant_id: 800001,
      sku: "ART-1042-CANVAS-16X20",
      title: "Desert Bloom",
      vendor: "369 Art Collective",
      quantity: 1,
      price: "78.00",
      price_set: { shop_money: { amount: "78.00", currency_code: "USD" } },
      total_discount: "0.00",
      discount_allocations: [
        {
          amount: "7.80",
          amount_set: { shop_money: { amount: "7.80", currency_code: "USD" } },
          discount_application_index: 0,
        },
      ],
      tax_lines: [{ title: "State Tax", price: "5.79", rate: 0.0825 }],
    },
    {
      id: 12011,
      product_id: 900002,
      variant_id: 800002,
      sku: "ART-2073-PRINT-11X14",
      title: "Night Arroyo",
      vendor: "369 Art Collective",
      quantity: 1,
      price: "40.00",
      price_set: { shop_money: { amount: "40.00", currency_code: "USD" } },
      total_discount: "0.00",
      discount_allocations: [
        {
          amount: "4.00",
          amount_set: { shop_money: { amount: "4.00", currency_code: "USD" } },
          discount_application_index: 0,
        },
      ],
      tax_lines: [{ title: "State Tax", price: "2.97", rate: 0.0825 }],
    },
  ],
};

export const discountedOrderTransactions: ShopifyTransaction[] = [
  {
    id: 77010,
    order_id: 5001000002,
    kind: "sale",
    status: "success",
    gateway: "shopify_payments",
    amount: "115.62",
    currency: "USD",
    receipt: { balance_transaction: { fee: 3.65, currency: "USD" } },
  },
];

/**
 * PayPal. The receipt carries no `balance_transaction`, so no fee is
 * discoverable — the normal case that `feePolicy` exists to decide about, not
 * an error.
 */
export const paypalOrder: ShopifyOrder = {
  id: 5001000003,
  name: "#1044",
  created_at: "2026-03-16T11:00:00-05:00",
  processed_at: "2026-03-16T11:00:04-05:00",
  currency: "USD",
  financial_status: "paid",
  total_price: "54.10",
  subtotal_price: "50.00",
  total_tax: "4.10",
  line_items: [
    {
      id: 12020,
      product_id: 900003,
      variant_id: 800003,
      sku: "ART-3311-PRINT-8X10",
      title: "Salt Flat",
      vendor: "369 Art Collective",
      quantity: 2,
      price: "25.00",
      price_set: { shop_money: { amount: "25.00", currency_code: "USD" } },
      total_discount: "0.00",
      discount_allocations: [],
    },
  ],
};

export const paypalOrderTransactions: ShopifyTransaction[] = [
  {
    id: 77020,
    order_id: 5001000003,
    kind: "sale",
    status: "success",
    gateway: "paypal",
    amount: "54.10",
    currency: "USD",
    receipt: {},
  },
];

/** A SKU that carries no recognisable work reference. Must hold, not guess. */
export const unattributableOrder: ShopifyOrder = {
  id: 5001000004,
  name: "#1045",
  created_at: "2026-03-17T08:30:00-05:00",
  processed_at: "2026-03-17T08:30:03-05:00",
  currency: "USD",
  financial_status: "paid",
  total_price: "22.00",
  line_items: [
    {
      id: 12030,
      product_id: 900009,
      variant_id: 800009,
      sku: "GIFTCARD-25",
      title: "Gift Card",
      vendor: "369 Art Collective",
      quantity: 1,
      price: "22.00",
      price_set: { shop_money: { amount: "22.00", currency_code: "USD" } },
      total_discount: "0.00",
      discount_allocations: [],
    },
  ],
};

/** Shopify test mode. Must never produce an event. */
export const testModeOrder: ShopifyOrder = {
  ...twoLineOrder,
  id: 5001000005,
  name: "#1046",
  test: true,
};

/**
 * A partial refund: one of the two lines returned in full.
 *
 * `subtotal` is "78.00" against an original line gross of $78.00, so the
 * proportion is exactly 10000 basis points and the original allocation reverses
 * without a stray cent.
 */
export const partialRefund: ShopifyRefund = {
  id: 66001,
  order_id: 5001000001,
  created_at: "2026-03-20T10:00:00-05:00",
  processed_at: "2026-03-20T10:00:02-05:00",
  note: "Damaged in transit",
  refund_line_items: [
    {
      id: 31001,
      line_item_id: 12001,
      quantity: 1,
      subtotal: "78.00",
      subtotal_set: { shop_money: { amount: "78.00", currency_code: "USD" } },
      total_tax: "6.44",
    },
  ],
};

/**
 * A partial-value refund on a discounted line — the case where dividing by the
 * undiscounted price would under-recover.
 *
 * The line sold for $70.20 after its $7.80 discount. A $35.10 refund is exactly
 * half of what was actually earned (5000 bp), but only 45% of the $78.00 list
 * price. The mapper divides by the recorded gross, not the list price.
 */
export const halfRefundOnDiscountedLine: ShopifyRefund = {
  id: 66002,
  order_id: 5001000002,
  created_at: "2026-03-21T09:00:00-05:00",
  processed_at: "2026-03-21T09:00:01-05:00",
  note: null,
  refund_line_items: [
    {
      id: 31002,
      line_item_id: 12010,
      quantity: 1,
      subtotal: "35.10",
      subtotal_set: { shop_money: { amount: "35.10", currency_code: "USD" } },
      total_tax: "2.90",
    },
  ],
};

/** A refund naming a line that was never ingested. Must be reported, not crash. */
export const refundForUnknownLine: ShopifyRefund = {
  id: 66003,
  order_id: 5001000001,
  created_at: "2026-03-22T09:00:00-05:00",
  processed_at: "2026-03-22T09:00:01-05:00",
  refund_line_items: [
    {
      id: 31003,
      line_item_id: 999999,
      quantity: 1,
      subtotal: "10.00",
      subtotal_set: { shop_money: { amount: "10.00", currency_code: "USD" } },
    },
  ],
};

/** Convenience map for `FixtureShopifyClient`. */
export const fixtureOrders = new Map<string, ShopifyOrder>([
  [String(twoLineOrder.id), twoLineOrder],
  [String(discountedOrder.id), discountedOrder],
  [String(paypalOrder.id), paypalOrder],
  [String(unattributableOrder.id), unattributableOrder],
  [String(testModeOrder.id), testModeOrder],
]);

export const fixtureTransactions = new Map<string, ShopifyTransaction[]>([
  [String(twoLineOrder.id), twoLineOrderTransactions],
  [String(discountedOrder.id), discountedOrderTransactions],
  [String(paypalOrder.id), paypalOrderTransactions],
  [String(unattributableOrder.id), []],
  [String(testModeOrder.id), twoLineOrderTransactions],
]);
