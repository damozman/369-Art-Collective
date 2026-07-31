import test from "node:test";
import assert from "node:assert/strict";

import {
  FixtureCostResolver,
  selectShippingProfile,
  shippingForQuantity,
} from "../cost-resolver";
import { BLUEPRINTS, PRINTIFY_COST_FIXTURES, PROVIDERS } from "../__fixtures__/printify-costs";
import { parseSKU, resolveSku } from "../sku-catalog";

const resolver = new FixtureCostResolver(PRINTIFY_COST_FIXTURES);

test("resolves production and shipping for a single unit", async () => {
  const cost = await resolver.resolveCost({
    blueprintId: BLUEPRINTS.Paper,
    printProviderId: PROVIDERS.Paper,
    variantId: 85201, // 8x10
    quantity: 1,
    destinationCountry: "US",
  });

  assert.equal(cost.productionMinor, 404);
  assert.equal(cost.shippingMinor, 629);
  assert.equal(cost.currency, "USD");
  assert.equal(cost.source, "fixture");
  assert.ok(cost.resolvedAt instanceof Date, "the snapshot carries its timestamp");
});

test("production scales with quantity but shipping uses the additional-item rate", async () => {
  const cost = await resolver.resolveCost({
    blueprintId: BLUEPRINTS.Paper,
    printProviderId: PROVIDERS.Paper,
    variantId: 85201,
    quantity: 3,
    destinationCountry: "US",
  });

  assert.equal(cost.productionMinor, 404 * 3);
  // Not 629 * 3 — the carrier charges once for the parcel, then a smaller
  // per-extra-item rate.
  assert.equal(cost.shippingMinor, 629 + 229 * 2);
});

test("falls back to the rest-of-world shipping bucket for unlisted countries", async () => {
  const us = await resolver.resolveCost({
    blueprintId: BLUEPRINTS.Canvas,
    printProviderId: PROVIDERS.Canvas,
    variantId: 55502,
    quantity: 1,
    destinationCountry: "US",
  });
  const de = await resolver.resolveCost({
    blueprintId: BLUEPRINTS.Canvas,
    printProviderId: PROVIDERS.Canvas,
    variantId: 55502,
    quantity: 1,
    destinationCountry: "DE",
  });

  assert.equal(us.shippingMinor, 750);
  assert.equal(de.shippingMinor, 1699);
  assert.ok(de.shippingMinor > us.shippingMinor);
});

test("an unknown variant raises rather than returning a default cost", async () => {
  await assert.rejects(
    () =>
      resolver.resolveCost({
        blueprintId: BLUEPRINTS.Paper,
        printProviderId: PROVIDERS.Paper,
        variantId: 999999,
        quantity: 1,
        destinationCountry: "US",
      }),
    /No cost fixture/
  );
});

test("zero quantity costs nothing", async () => {
  const cost = await resolver.resolveCost({
    blueprintId: BLUEPRINTS.Paper,
    printProviderId: PROVIDERS.Paper,
    variantId: 85201,
    quantity: 0,
    destinationCountry: "US",
  });
  assert.equal(cost.productionMinor, 0);
  assert.equal(cost.shippingMinor, 0);
});

// ---- Printify shipping-profile selection (pure, so testable offline) ----

const PROFILES = [
  {
    variant_ids: [1, 2],
    first_item: { cost: 450, currency: "USD" },
    additional_items: { cost: 209, currency: "USD" },
    countries: ["US"],
  },
  {
    variant_ids: [1, 2],
    first_item: { cost: 1150, currency: "USD" },
    additional_items: { cost: 600, currency: "USD" },
    countries: ["REST_OF_THE_WORLD"],
  },
];

test("an exact country match beats the catch-all bucket", () => {
  const profile = selectShippingProfile(PROFILES, 1, "US");
  assert.equal(profile?.first_item.cost, 450);
});

test("unlisted countries land in the catch-all bucket", () => {
  const profile = selectShippingProfile(PROFILES, 1, "JP");
  assert.equal(profile?.first_item.cost, 1150);
});

test("a variant with no profile at all resolves to null, not a guess", () => {
  assert.equal(selectShippingProfile(PROFILES, 99, "US"), null);
});

test("shipping for quantity uses first-item plus additional-item rates", () => {
  assert.equal(shippingForQuantity(PROFILES[0], 1), 450);
  assert.equal(shippingForQuantity(PROFILES[0], 4), 450 + 209 * 3);
  assert.equal(shippingForQuantity(PROFILES[0], 0), 0);
});

// ---- SKU bridging ----

test("parses a full SKU including the size and finish the old parser dropped", () => {
  const parts = parseSKU("ART-JH-abc123-18x24-Canvas");
  assert.deepEqual(parts, {
    artistShort: "JH",
    artworkId: "abc123",
    size: "18x24",
    finish: "Canvas",
  });
});

test("parses a SKU whose artwork id is a uuid", () => {
  const parts = parseSKU("ART-JH-3f2b1c9a-1111-2222-3333-444455556666-24x36-Metal");
  assert.equal(parts?.artworkId, "3f2b1c9a-1111-2222-3333-444455556666");
  assert.equal(parts?.size, "24x36");
  assert.equal(parts?.finish, "Metal");
});

test("rejects a malformed SKU instead of half-parsing it", () => {
  assert.equal(parseSKU("NOT-A-SKU"), null);
  assert.equal(parseSKU("ART-JH-abc123"), null);
});

test("resolves a SKU all the way to Printify identifiers", () => {
  const resolved = resolveSku("ART-JH-abc123-18x24-Canvas");
  assert.equal(resolved?.catalog.blueprintId, BLUEPRINTS.Canvas);
  assert.equal(resolved?.catalog.variantId, 55503);
});

test("an unmappable size/finish resolves to null so the caller must hold the line", () => {
  assert.equal(resolveSku("ART-JH-abc123-99x99-Canvas"), null);
  assert.equal(resolveSku("ART-JH-abc123-18x24-Hologram"), null);
});

test("every catalog entry has a matching cost fixture", () => {
  // Guards the bridge: a size/finish that maps to identifiers with no cost
  // behind them would resolve and then fail at cost time.
  for (const fixture of PRINTIFY_COST_FIXTURES) {
    assert.ok(
      fixture.shipping.some((s) => s.countries.includes("US")),
      `variant ${fixture.variantId} has no US shipping rate`
    );
    assert.ok(fixture.unitProductionMinor > 0);
    assert.ok(Number.isInteger(fixture.unitProductionMinor));
  }
});
