/**
 * The slice of Shopify's Admin API payloads this adapter actually reads.
 *
 * WHY A HAND-WRITTEN SUBSET RATHER THAN A GENERATED CLIENT. A Shopify order
 * webhook carries well over a hundred fields. Typing all of them buys nothing
 * and hides which ones move money — and a generated type would let a careless
 * edit start reading `total_price` (which includes tax and shipping) where it
 * meant `price`. Everything declared here is a field the calculation depends
 * on, so the type doubles as the list of things to re-check when Shopify
 * versions the API.
 *
 * EVERY MONETARY FIELD IS A STRING. Shopify sends decimal strings ("42.00"),
 * and they stay strings until `parseDecimalToMinor` turns them into minor
 * units. `JSON.parse` on a webhook body would happily produce a float here; the
 * types say string so that path does not type-check.
 *
 * SHOP MONEY, NOT PRESENTMENT MONEY. Every `*_set` field carries both what the
 * customer saw (`presentment_money`) and what the merchant is settled in
 * (`shop_money`). The ledger is in the tenant's own currency, so this adapter
 * reads `shop_money` throughout. Reading presentment money would silently mix
 * currencies on a store that sells internationally — the exact failure §5 #3
 * puts a currency code beside every amount to catch.
 */

/** Shopify's dual-currency amount wrapper. */
export interface ShopifyMoneySet {
  shop_money: { amount: string; currency_code: string };
  presentment_money?: { amount: string; currency_code: string };
}

/** A discount applied to one line, from `line_item.discount_allocations`. */
export interface ShopifyDiscountAllocation {
  amount: string;
  amount_set?: ShopifyMoneySet;
  discount_application_index?: number;
}

export interface ShopifyTaxLine {
  title?: string;
  price: string;
  price_set?: ShopifyMoneySet;
  rate?: number;
}

/** A line-item property — the `_artwork_id` style hidden field carts use. */
export interface ShopifyLineItemProperty {
  name: string;
  value: string;
}

export interface ShopifyLineItem {
  id: number;
  product_id: number | null;
  variant_id: number | null;
  sku: string | null;
  title: string;
  variant_title?: string | null;
  vendor?: string | null;
  quantity: number;

  /** Unit price before discounts, in shop currency. */
  price: string;
  price_set?: ShopifyMoneySet;

  /** Legacy aggregate line discount. `discount_allocations` supersedes it. */
  total_discount?: string;
  total_discount_set?: ShopifyMoneySet;
  discount_allocations?: ShopifyDiscountAllocation[];

  tax_lines?: ShopifyTaxLine[];
  properties?: ShopifyLineItemProperty[];

  /** Set when the line has been fully refunded and removed from fulfilment. */
  fulfillable_quantity?: number;
}

export interface ShopifyOrder {
  id: number;
  /** The human order number — "#1042". Used only for descriptions. */
  name?: string;
  order_number?: number;

  created_at: string;
  /** When the order was actually paid. Preferred over `created_at` for dating. */
  processed_at?: string | null;

  currency: string;
  presentment_currency?: string;

  financial_status?: string | null;
  cancelled_at?: string | null;

  /** Shopify's test-mode flag. Test orders must never reach a real ledger. */
  test?: boolean;

  total_price?: string;
  subtotal_price?: string;
  total_tax?: string;
  total_discounts?: string;
  total_shipping_price_set?: ShopifyMoneySet;

  line_items: ShopifyLineItem[];
}

/** One line of a refund. `subtotal` excludes tax, which is what we reverse on. */
export interface ShopifyRefundLineItem {
  id: number;
  line_item_id: number;
  quantity: number;
  /** Refunded amount for this line, excluding tax. */
  subtotal: string;
  subtotal_set?: ShopifyMoneySet;
  total_tax?: string;
  total_tax_set?: ShopifyMoneySet;
}

export interface ShopifyRefund {
  id: number;
  order_id: number;
  created_at: string;
  processed_at?: string | null;
  note?: string | null;
  refund_line_items: ShopifyRefundLineItem[];
}

/**
 * One payment transaction on an order.
 *
 * The fee lives on `receipt.balance_transaction.fee` and is present only for
 * Shopify Payments. That absence is the whole reason `feePolicy` exists — see
 * `map.ts`.
 */
export interface ShopifyTransaction {
  id: number;
  order_id: number;
  kind: string; // sale | capture | authorization | refund | void
  status: string; // success | pending | failure | error
  gateway?: string;
  amount: string;
  currency: string;
  processed_at?: string | null;
  receipt?: {
    balance_transaction?: {
      /** Provider fee in MAJOR units as a number — Stripe-shaped, not Shopify-shaped. */
      fee?: number | string;
      currency?: string;
      net?: number | string;
    };
  } | null;
}

/** Topics this adapter handles. Anything else is acknowledged and ignored. */
export type ShopifyWebhookTopic =
  | "orders/create"
  | "orders/paid"
  | "orders/updated"
  | "orders/cancelled"
  | "refunds/create"
  | "app/uninstalled";

/** Headers Shopify sets on every webhook delivery. */
export interface ShopifyWebhookHeaders {
  hmac: string | null;
  topic: string | null;
  shopDomain: string | null;
  webhookId: string | null;
  apiVersion: string | null;
  triggeredAt: string | null;
}
