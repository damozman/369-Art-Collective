import test from "node:test";
import assert from "node:assert/strict";

import { FixtureCostResolver } from "../cost-resolver";
import { PRINTIFY_COST_FIXTURES } from "../__fixtures__/printify-costs";
import { processShopifyOrder, type OrderStore } from "../order-processor";

const resolver = new FixtureCostResolver(PRINTIFY_COST_FIXTURES);

/** In-memory store recording everything the processor writes. */
function makeStore(overrides: Partial<OrderStore> = {}) {
  const orders: any[] = [];
  const sales: any[] = [];

  const store: OrderStore = {
    async getAllArtists() {
      return [
        { id: "artist-1", name: "Jane", referralCode: "JH-ABCD1234", monthlySales: "0" },
        { id: "artist-2", name: "Sam", referralCode: "SM-WXYZ9876", monthlySales: "0" },
      ];
    },
    async getArtwork(id: string) {
      if (id === "missing") return null;
      return { id, artistId: "artist-1", printifyProductId: "pp-1" };
    },
    async getArtist(id: string) {
      return { id, name: "Jane", monthlySales: "0" };
    },
    async createOrder(values: any) {
      const row = { id: `order-${orders.length + 1}`, ...values };
      orders.push(row);
      return row;
    },
    async createSale(values: any) {
      const row = { id: `sale-${sales.length + 1}`, ...values };
      sales.push(row);
      return row;
    },
    async updateArtworkLastSaleDate() {
      return undefined;
    },
    ...overrides,
  };

  return { store, orders, sales };
}

function line(overrides: Partial<any> = {}) {
  return {
    id: 1001,
    product_id: 1,
    variant_id: 1,
    sku: "ART-JH-abc123-8x10-Paper",
    title: "Test",
    quantity: 1,
    price: "19.00",
    name: "Test",
    ...overrides,
  };
}

function order(lineItems: any[], overrides: Partial<any> = {}) {
  return {
    id: 5001,
    email: "buyer@example.com",
    created_at: "2026-07-01T00:00:00Z",
    total_price: "19.00",
    currency: "USD",
    line_items: lineItems,
    shipping_address: {
      first_name: "A",
      last_name: "B",
      address1: "1 Main St",
      city: "Austin",
      province: "Texas",
      province_code: "TX",
      country: "United States",
      country_code: "US",
      zip: "78701",
    },
    ...overrides,
  };
}

test("records a sale from real resolved costs, not placeholders", async () => {
  const { store, orders, sales } = makeStore();

  const result = await processShopifyOrder(order([line()]), resolver, store);

  assert.deepEqual(result, { processed: 1, heldForReview: 0, skipped: 0 });
  assert.equal(orders.length, 1);
  assert.equal(sales.length, 1);

  const [o] = orders;
  assert.equal(o.grossMinor, 1900);
  assert.equal(o.productionMinor, 404); // resolved, not 1500
  assert.equal(o.shippingMinorAmount, 629); // resolved, not 500
  assert.equal(o.processingFeeMinor, 85); // 2.9% of 19.00 + 30c
  assert.equal(o.netMinor, 1900 - 404 - 629 - 85);
  assert.equal(o.costSource, "fixture");
  assert.ok(o.costResolvedAt instanceof Date, "the snapshot timestamp is persisted");
  assert.equal(o.status, "pending");

  const [s] = sales;
  assert.equal(s.royaltyTier, 30);
  assert.equal(s.totalEarningsMinor, 235);
  assert.equal(s.totalEarnings, "2.35");
  assert.equal(s.recruitmentBonus, "0", "recruitment residuals are gone");
});

test("one row per line item — a two-artwork order no longer loses its second line", async () => {
  const { store, orders, sales } = makeStore();

  const result = await processShopifyOrder(
    order(
      [
        line({ id: 1001, sku: "ART-JH-abc123-8x10-Paper", price: "19.00" }),
        line({ id: 1002, sku: "ART-JH-def456-18x24-Canvas", price: "99.00" }),
      ],
      { total_price: "118.00" }
    ),
    resolver,
    store
  );

  assert.equal(result.processed, 2);
  assert.equal(orders.length, 2);
  assert.equal(sales.length, 2);
  // Same Shopify order, distinct line item IDs — the pair is what is unique.
  assert.equal(orders[0].shopifyOrderId, "5001");
  assert.equal(orders[1].shopifyOrderId, "5001");
  assert.notEqual(orders[0].shopifyLineItemId, orders[1].shopifyLineItemId);
});

test("the fixed processing fee is charged once per order, not once per line", async () => {
  const { store, orders } = makeStore();

  await processShopifyOrder(
    order(
      [
        line({ id: 1001, sku: "ART-JH-abc123-8x10-Paper", price: "19.00" }),
        line({ id: 1002, sku: "ART-JH-def456-18x24-Canvas", price: "99.00" }),
        line({ id: 1003, sku: "ART-JH-ghi789-12x16-Metal", price: "89.00" }),
      ],
      { total_price: "207.00" }
    ),
    resolver,
    store
  );

  const totalFee = orders.reduce((sum, o) => sum + o.processingFeeMinor, 0);
  // 2.9% of $207.00 = 600.3 -> 600, plus a single 30c.
  assert.equal(totalFee, 630);
});

test("a line whose costs cannot be resolved is held, not paid on an assumption", async () => {
  // A resolver that knows nothing — stands in for a Printify outage or an
  // unmapped variant.
  const emptyResolver = new FixtureCostResolver([]);
  const { store, orders, sales } = makeStore();

  const result = await processShopifyOrder(order([line()]), emptyResolver, store);

  assert.deepEqual(result, { processed: 0, heldForReview: 1, skipped: 0 });
  assert.equal(sales.length, 0, "no royalty is calculated");
  assert.equal(orders.length, 1, "but the revenue is still recorded");
  assert.equal(orders[0].status, "needs_review");
  assert.match(orders[0].costResolutionError, /No cost fixture/);
});

test("a mix of resolvable and unresolvable lines pays only the resolvable ones", async () => {
  const { store, orders, sales } = makeStore();

  const result = await processShopifyOrder(
    order([
      line({ id: 1001, sku: "ART-JH-abc123-8x10-Paper", price: "19.00" }),
      // Valid SKU shape, but 40x60 is not in the catalog map, so it never
      // reaches the resolver — it is skipped at the bridge.
      line({ id: 1002, sku: "ART-JH-def456-40x60-Paper", price: "199.00" }),
    ]),
    resolver,
    store
  );

  assert.equal(result.processed, 1);
  assert.equal(result.skipped, 1);
  assert.equal(sales.length, 1);
  assert.equal(orders.length, 1);
});

test("a referral link adds the bonus for a different artist's sale", async () => {
  const { store, sales } = makeStore();

  await processShopifyOrder(
    order([line()], {
      landing_site: "https://shop.example.com/?utm_source=SM-WXYZ9876&utm_medium=social",
    }),
    resolver,
    store
  );

  assert.equal(sales.length, 1);
  assert.ok(Number(sales[0].referralBonusMinor) > 0);
  assert.equal(sales[0].referralBonusMinor, 39); // 5% of 782
});

test("an artist's own referral link does not pay them a bonus on their own sale", async () => {
  const { store, sales } = makeStore({
    async getArtist() {
      return { id: "artist-1", name: "Jane", monthlySales: "0" };
    },
  });

  await processShopifyOrder(
    order([line()], {
      landing_site: "https://shop.example.com/?utm_source=JH-ABCD1234",
    }),
    resolver,
    store
  );

  assert.equal(sales[0].referralBonusMinor, 0);
});

test("the tier rate comes from the artist's monthly sales amount", async () => {
  const { store, sales } = makeStore({
    async getArtist() {
      // $6,000 this month -> the 40% rung that used to throw on validation
      return { id: "artist-1", name: "Jane", monthlySales: "6000.00" };
    },
  });

  await processShopifyOrder(order([line()]), resolver, store);

  assert.equal(sales[0].royaltyTier, 40);
  assert.equal(sales[0].totalEarningsMinor, 313); // 40% of 782 = 312.8 -> 313
});

test("a line with no SKU is skipped without recording anything", async () => {
  const { store, orders, sales } = makeStore();

  const result = await processShopifyOrder(
    order([line({ sku: "" })]),
    resolver,
    store
  );

  assert.deepEqual(result, { processed: 0, heldForReview: 0, skipped: 1 });
  assert.equal(orders.length, 0);
  assert.equal(sales.length, 0);
});

test("international shipping is resolved from the destination country", async () => {
  const { store, orders } = makeStore();

  await processShopifyOrder(
    order([line()], {
      shipping_address: {
        first_name: "A",
        last_name: "B",
        address1: "1 Hauptstr",
        city: "Berlin",
        province: "Berlin",
        province_code: "BE",
        country: "Germany",
        country_code: "DE",
        zip: "10115",
      },
    }),
    resolver,
    store
  );

  assert.equal(orders[0].shippingMinorAmount, 1299, "rest-of-world rate, not the US rate");
  assert.ok(orders[0].netMinor < 1900 - 404 - 629 - 85, "the higher cost reduces net");
});
