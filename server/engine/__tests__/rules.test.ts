import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluate,
  isEffectiveAt,
  resolveTier,
  selectRule,
  type EvaluableRule,
  type RuleContext,
} from "../rules";
import type { RevenueEvent } from "../revenue-event";

const TENANT = "tenant-1";
const ALICE = "contributor-alice";
const BOB = "contributor-bob";

function rule(overrides: Partial<EvaluableRule> = {}): EvaluableRule {
  return {
    id: "rule-1",
    ruleKey: "standard",
    version: 1,
    effectiveFrom: new Date("2026-01-01T00:00:00Z"),
    effectiveTo: null,
    scope: "tenant",
    scopeRef: null,
    contributorId: null,
    role: null,
    basis: "net",
    method: "percent",
    valueBasisPoints: 3000,
    valueMinor: null,
    tierTable: null,
    costDeductions: ["production", "shipping", "processing_fee"],
    priority: 0,
    currency: "USD",
    active: true,
    ...overrides,
  };
}

function event(overrides: Partial<RevenueEvent> = {}): RevenueEvent {
  return {
    tenantId: TENANT,
    source: "shopify",
    sourceEventId: "order-1:line-1",
    direction: "sale",
    occurredAt: new Date("2026-06-15T12:00:00Z"),
    grossAmountMinor: 9900n,
    currency: "USD",
    quantity: 1,
    contributorRefs: [{ ref: "alice" }],
    costs: [
      { type: "production", amountMinor: 1500n, currency: "USD" },
      { type: "shipping", amountMinor: 800n, currency: "USD" },
      { type: "processing_fee", amountMinor: 312n, currency: "USD" },
    ],
    ...overrides,
  };
}

function context(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    tenantId: TENANT,
    occurredAt: new Date("2026-06-15T12:00:00Z"),
    workId: null,
    productType: null,
    contributors: [{ contributorId: ALICE }],
    ...overrides,
  };
}

// ---- Effective dating (§5 #5) ----

test("a rule is in force from effectiveFrom inclusive to effectiveTo exclusive", () => {
  const r = rule({
    effectiveFrom: new Date("2026-03-01T00:00:00Z"),
    effectiveTo: new Date("2026-06-01T00:00:00Z"),
  });

  assert.equal(isEffectiveAt(r, new Date("2026-02-28T23:59:59Z")), false);
  assert.equal(isEffectiveAt(r, new Date("2026-03-01T00:00:00Z")), true);
  assert.equal(isEffectiveAt(r, new Date("2026-05-31T23:59:59Z")), true);
  assert.equal(isEffectiveAt(r, new Date("2026-06-01T00:00:00Z")), false, "exclusive end");
});

test("a rate change on March 1 does not rewrite February's history", () => {
  // This is the property §5 #5 exists for, and the reason rule selection takes
  // the event's occurredAt rather than reading the clock.
  const february = rule({
    id: "r-feb",
    ruleKey: "standard",
    version: 1,
    valueBasisPoints: 3000,
    effectiveFrom: new Date("2026-01-01T00:00:00Z"),
    effectiveTo: new Date("2026-03-01T00:00:00Z"),
  });
  const march = rule({
    id: "r-mar",
    ruleKey: "standard",
    version: 2,
    valueBasisPoints: 4000,
    effectiveFrom: new Date("2026-03-01T00:00:00Z"),
  });

  const rules = [february, march];

  const febEvent = event({ occurredAt: new Date("2026-02-15T00:00:00Z") });
  const febResult = evaluate(rules, febEvent, context({ occurredAt: febEvent.occurredAt }));
  assert.equal(febResult.allocations[0].ruleVersion, 1);
  assert.equal(febResult.allocations[0].rateBasisPoints, 3000);

  const marEvent = event({ occurredAt: new Date("2026-03-15T00:00:00Z") });
  const marResult = evaluate(rules, marEvent, context({ occurredAt: marEvent.occurredAt }));
  assert.equal(marResult.allocations[0].ruleVersion, 2);
  assert.equal(marResult.allocations[0].rateBasisPoints, 4000);
});

test("an inactive rule never applies", () => {
  assert.equal(isEffectiveAt(rule({ active: false }), new Date("2026-06-15T00:00:00Z")), false);
});

// ---- Selection ----

test("higher priority wins", () => {
  const low = rule({ id: "low", priority: 0, valueBasisPoints: 3000 });
  const high = rule({ id: "high", priority: 10, valueBasisPoints: 5000 });
  const winner = selectRule([low, high], context(), ALICE);
  assert.equal(winner?.id, "high");
});

test("on equal priority the more specific scope wins", () => {
  const tenantWide = rule({ id: "tenant-wide", scope: "tenant" });
  const perWork = rule({ id: "per-work", scope: "work", scopeRef: "work-1" });

  const winner = selectRule([tenantWide, perWork], context({ workId: "work-1" }), ALICE);
  assert.equal(winner?.id, "per-work");
});

test("a contributor-scoped rule beats a tenant-wide one", () => {
  const tenantWide = rule({ id: "tenant-wide", scope: "tenant" });
  const perContributor = rule({ id: "per-contributor", scope: "contributor", scopeRef: ALICE });

  const winner = selectRule([tenantWide, perContributor], context(), ALICE);
  assert.equal(winner?.id, "per-contributor");
});

test("a contributor-scoped rule does not leak to another contributor", () => {
  const aliceOnly = rule({ id: "alice", scope: "contributor", scopeRef: ALICE });
  assert.equal(selectRule([aliceOnly], context(), BOB), null);
});

test("scope matching respects product type", () => {
  const posters = rule({ id: "posters", scope: "product_type", scopeRef: "poster" });
  assert.equal(selectRule([posters], context({ productType: "poster" }), ALICE)?.id, "posters");
  assert.equal(selectRule([posters], context({ productType: "canvas" }), ALICE), null);
});

test("no applicable rule returns null rather than a default rate", () => {
  // Inventing a default here is how you confidently pay the wrong amount.
  assert.equal(selectRule([], context(), ALICE), null);
});

test("overlapping rules resolve to one winner, never a sum", () => {
  // Summing would silently double-pay whenever a tenant adds a rule believing
  // it replaced an older one.
  const a = rule({ id: "a", priority: 5, valueBasisPoints: 3000 });
  const b = rule({ id: "b", priority: 5, scope: "contributor", scopeRef: ALICE, valueBasisPoints: 4000 });

  const result = evaluate([a, b], event(), context());
  assert.equal(result.allocations.length, 1);
  assert.equal(result.allocations[0].ruleId, "b");
});

// ---- Computation ----

test("percent of net deducts only the named cost types", () => {
  const result = evaluate([rule()], event(), context());
  const [allocation] = result.allocations;

  // gross 9900 - (1500 + 800 + 312) = 7288
  assert.equal(allocation.basisAmountMinor, 7288n);
  assert.equal(allocation.deductedCostsMinor, 2612n);
  assert.equal(allocation.amountMinor, 2186n); // 30% of 7288 = 2186.4 -> 2186
});

test("a rule that deducts nothing pays on gross even with costs present", () => {
  const result = evaluate([rule({ costDeductions: [] })], event(), context());
  assert.equal(result.allocations[0].basisAmountMinor, 9900n);
  assert.equal(result.allocations[0].amountMinor, 2970n);
});

test("percent of gross ignores costs entirely", () => {
  const result = evaluate([rule({ basis: "gross" })], event(), context());
  assert.equal(result.allocations[0].basisAmountMinor, 9900n);
  assert.equal(result.allocations[0].amountMinor, 2970n);
});

test("two tenants can treat shipping differently without a code change", () => {
  // The knob that makes this a platform rather than one merchant's calculator.
  const passesThrough = rule({ id: "a", costDeductions: ["production", "shipping"] });
  const absorbs = rule({ id: "b", costDeductions: ["production"] });

  const withShipping = evaluate([passesThrough], event(), context()).allocations[0];
  const withoutShipping = evaluate([absorbs], event(), context()).allocations[0];

  assert.equal(withShipping.basisAmountMinor, 7600n); // 9900 - 1500 - 800
  assert.equal(withoutShipping.basisAmountMinor, 8400n); // 9900 - 1500
  assert.ok(withoutShipping.amountMinor > withShipping.amountMinor);
});

test("flat_per_unit multiplies by quantity", () => {
  const r = rule({ method: "flat_per_unit", valueMinor: 250n, valueBasisPoints: null });
  const result = evaluate([r], event({ quantity: 4 }), context());
  assert.equal(result.allocations[0].amountMinor, 1000n);
});

test("flat_per_event ignores quantity", () => {
  const r = rule({ method: "flat_per_event", valueMinor: 500n, valueBasisPoints: null });
  const result = evaluate([r], event({ quantity: 7 }), context());
  assert.equal(result.allocations[0].amountMinor, 500n);
});

test("flat amounts follow the event's sign so a reversal gives back what was paid", () => {
  const r = rule({ method: "flat_per_unit", valueMinor: 250n, valueBasisPoints: null });
  const sale = evaluate([r], event({ quantity: 4 }), context()).allocations[0];
  const refund = evaluate(
    [r],
    event({ quantity: 4, grossAmountMinor: -9900n, direction: "reversal", reversesSourceEventId: "order-1:line-1" }),
    context()
  ).allocations[0];

  assert.equal(refund.amountMinor, -sale.amountMinor);
});

test("tiered rules resolve against trailing volume", () => {
  const ladder = [
    { minMinor: 0n, basisPoints: 3000 },
    { minMinor: 100000n, basisPoints: 3500 },
    { minMinor: 500000n, basisPoints: 4000 },
    { minMinor: 1000000n, basisPoints: 4500 },
  ];
  const r = rule({ method: "tiered", tierTable: ladder, valueBasisPoints: null });

  const low = evaluate([r], event(), context({
    contributors: [{ contributorId: ALICE, trailingVolumeMinor: 50000n }],
  }));
  assert.equal(low.allocations[0].rateBasisPoints, 3000);

  const high = evaluate([r], event(), context({
    contributors: [{ contributorId: ALICE, trailingVolumeMinor: 600000n }],
  }));
  assert.equal(high.allocations[0].rateBasisPoints, 4000);
});

test("resolveTier needs a rung at zero and says so", () => {
  assert.throws(
    () => resolveTier([{ minMinor: 100n, basisPoints: 3000 }], 50n),
    /needs a rung at 0/
  );
});

// ---- Multi-party (§5 #10) ----

test("one event can pay several contributors under different rules", () => {
  const artistRule = rule({
    id: "artist",
    scope: "contributor",
    scopeRef: ALICE,
    valueBasisPoints: 3000,
  });
  const producerRule = rule({
    id: "producer",
    scope: "contributor",
    scopeRef: BOB,
    valueBasisPoints: 1000,
  });

  const result = evaluate(
    [artistRule, producerRule],
    event(),
    context({ contributors: [{ contributorId: ALICE }, { contributorId: BOB }] })
  );

  assert.equal(result.allocations.length, 2);
  assert.equal(result.allocations[0].amountMinor, 2186n); // 30% of 7288
  assert.equal(result.allocations[1].amountMinor, 729n); // 10% of 7288 = 728.8 -> 729
});

test("over-allocation is caught and warned about", () => {
  const greedyA = rule({ id: "a", scope: "contributor", scopeRef: ALICE, basis: "gross", valueBasisPoints: 7000 });
  const greedyB = rule({ id: "b", scope: "contributor", scopeRef: BOB, basis: "gross", valueBasisPoints: 6000 });

  const result = evaluate(
    [greedyA, greedyB],
    event(),
    context({ contributors: [{ contributorId: ALICE }, { contributorId: BOB }] })
  );

  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /exceeds gross/);
  assert.ok(result.remainderMinor < 0n);
});

test("the remainder is what the tenant keeps", () => {
  const result = evaluate([rule({ basis: "gross", valueBasisPoints: 3000 })], event(), context());
  assert.equal(result.remainderMinor, 9900n - 2970n);
});

test("a contributor with no rule produces a warning, not an allocation", () => {
  const aliceOnly = rule({ scope: "contributor", scopeRef: ALICE });
  const result = evaluate(
    [aliceOnly],
    event(),
    context({ contributors: [{ contributorId: ALICE }, { contributorId: BOB }] })
  );

  assert.equal(result.allocations.length, 1);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /No applicable rule/);
});

test("a source-supplied share subdivides the rule result", () => {
  const result = evaluate(
    [rule({ basis: "gross", valueBasisPoints: 10000 })],
    event(),
    context({
      contributors: [
        { contributorId: ALICE, shareBasisPoints: 6000 },
        { contributorId: BOB, shareBasisPoints: 4000 },
      ],
    })
  );

  assert.equal(result.allocations[0].amountMinor, 5940n); // 60% of 9900
  assert.equal(result.allocations[1].amountMinor, 3960n); // 40% of 9900
  assert.equal(result.remainderMinor, 0n);
});

// ---- Explanation trace (§5 #6) ----

test("every allocation carries a reconstructable explanation", () => {
  const result = evaluate([rule()], event(), context());
  const [allocation] = result.allocations;

  assert.match(allocation.explanation, /Gross \$99\.00/);
  assert.match(allocation.explanation, /Net \$72\.88/);
  assert.match(allocation.explanation, /30% of net \$21\.86/);
  assert.match(allocation.explanation, /rule standard v1/);

  // The structured trace carries the same derivation for the UI to render.
  assert.ok(allocation.trace.length >= 3);
  assert.equal(allocation.trace[0].label, "Gross");
  assert.equal(allocation.trace[0].amountMinor, 9900n);
});

test("the snapshot records the rule version that actually paid", () => {
  const v2 = rule({ id: "r2", version: 2, valueBasisPoints: 3500 });
  const result = evaluate([v2], event(), context());

  assert.equal(result.allocations[0].ruleVersion, 2);
  assert.equal(result.allocations[0].ruleId, "r2");
  assert.equal(result.allocations[0].rateBasisPoints, 3500);
});
