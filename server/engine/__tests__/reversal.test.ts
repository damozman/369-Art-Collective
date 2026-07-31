import test from "node:test";
import assert from "node:assert/strict";

import {
  applyClawbackPolicy,
  buildReversingAllocations,
  needsReview,
  reserveForPayout,
  type ReversibleAllocation,
} from "../reversal";
import { deriveBalance, type LedgerEntryInput } from "../ledger";
import { buildReversal, validateRevenueEvent, EventValidationError, type RevenueEvent } from "../revenue-event";
import { evaluate, type EvaluableRule } from "../rules";

const TENANT = "tenant-1";
const ALICE = "contributor-alice";
const BOB = "contributor-bob";

function original(overrides: Partial<ReversibleAllocation> = {}): ReversibleAllocation {
  return {
    id: "alloc-1",
    contributorId: ALICE,
    amountMinor: 2186n,
    currency: "USD",
    ruleId: "rule-1",
    ruleKey: "standard",
    ruleVersion: 3,
    grossAmountMinor: 9900n,
    deductedCostsMinor: 2612n,
    basisAmountMinor: 7288n,
    basis: "net",
    method: "percent",
    rateBasisPoints: 3000,
    explanation: "Gross $99.00; Net $72.88; 30% of net $21.86 [rule standard v3]",
    ...overrides,
  };
}

// ---- Building reversals ----

test("a full reversal is the exact negation of the original", () => {
  const [reversal] = buildReversingAllocations([original()]);
  assert.equal(reversal.amountMinor, -2186n);
  assert.equal(reversal.reversesAllocationId, "alloc-1");
  assert.equal(reversal.contributorId, ALICE);
});

test("the reversal carries the ORIGINAL rule version, not today's", () => {
  // Recomputing from the current rule would reverse a different amount than was
  // paid whenever the rule has changed since — precisely the case effective
  // dating exists for, and the hardest one to notice getting wrong.
  const [reversal] = buildReversingAllocations([original({ ruleVersion: 3 })]);
  assert.equal(reversal.ruleVersion, 3);
  assert.equal(reversal.rateBasisPoints, 3000);
});

test("the reversal explanation quotes the original derivation", () => {
  const [reversal] = buildReversingAllocations([original()], { reason: "customer chargeback" });
  assert.match(reversal.explanation, /Reversal of allocation alloc-1/);
  assert.match(reversal.explanation, /customer chargeback/);
  assert.match(reversal.explanation, /30% of net \$21\.86/);
});

test("a partial refund reverses proportionally", () => {
  const [half] = buildReversingAllocations([original()], { partialBasisPoints: 5000 });
  assert.equal(half.amountMinor, -1093n); // 50% of 2186
  assert.match(half.explanation, /50% partial/);
});

test("partial proportions are applied per allocation, keeping parts consistent", () => {
  const reversals = buildReversingAllocations(
    [original({ id: "a1", amountMinor: 2186n }), original({ id: "a2", contributorId: BOB, amountMinor: 729n })],
    { partialBasisPoints: 5000 }
  );
  assert.equal(reversals[0].amountMinor, -1093n);
  assert.equal(reversals[1].amountMinor, -365n); // 50% of 729 = 364.5 -> 365
});

test("an out-of-range partial proportion is rejected", () => {
  assert.throws(() => buildReversingAllocations([original()], { partialBasisPoints: 0 }), /must be in/);
  assert.throws(() => buildReversingAllocations([original()], { partialBasisPoints: 10001 }), /must be in/);
});

// ---- Clawback policies (§8) ----

test("recoup pushes the loss onto the contributor's balance", () => {
  const reversals = buildReversingAllocations([original()]);
  const outcome = applyClawbackPolicy(reversals, {
    tenantId: TENANT,
    policy: "recoup",
    occurredAt: new Date("2026-08-01T00:00:00Z"),
  });

  assert.equal(outcome.entries.length, 1);
  assert.equal(outcome.entries[0].amountMinor, -2186n);
  assert.equal(outcome.entries[0].availableAt, null, "clawbacks are never held");
  assert.equal(outcome.contributorImpactMinor, -2186n);
  assert.equal(outcome.tenantAbsorbedMinor, 0n);
});

test("absorb leaves contributor balances untouched", () => {
  const reversals = buildReversingAllocations([original()]);
  const outcome = applyClawbackPolicy(reversals, {
    tenantId: TENANT,
    policy: "absorb",
    occurredAt: new Date(),
  });

  assert.equal(outcome.entries.length, 0);
  assert.equal(outcome.contributorImpactMinor, 0n);
  assert.equal(outcome.tenantAbsorbedMinor, -2186n);
});

test("reserve draws from what was withheld before touching the balance", () => {
  const reversals = buildReversingAllocations([original()]);
  const outcome = applyClawbackPolicy(reversals, {
    tenantId: TENANT,
    policy: "reserve",
    occurredAt: new Date(),
    reserveByContributorMinor: { [ALICE]: 5000n },
  });

  assert.equal(outcome.reserveDrawnMinor, 2186n);
  assert.equal(outcome.contributorImpactMinor, 0n);
  assert.equal(outcome.entries.length, 0, "reserve covered it entirely");
});

test("reserve recoups only the shortfall when the reserve is too small", () => {
  const reversals = buildReversingAllocations([original()]);
  const outcome = applyClawbackPolicy(reversals, {
    tenantId: TENANT,
    policy: "reserve",
    occurredAt: new Date(),
    reserveByContributorMinor: { [ALICE]: 1000n },
  });

  assert.equal(outcome.reserveDrawnMinor, 1000n);
  assert.equal(outcome.contributorImpactMinor, -1186n);
  assert.equal(outcome.entries[0].amountMinor, -1186n);
  assert.match(outcome.entries[0].description!, /Reserve covered 1000/);
});

test("reserveForPayout only withholds under the reserve policy", () => {
  assert.equal(reserveForPayout(10000n, "reserve", 1000), 1000n);
  assert.equal(reserveForPayout(10000n, "recoup", 1000), 0n);
  assert.equal(reserveForPayout(10000n, "absorb", 1000), 0n);
  assert.equal(reserveForPayout(0n, "reserve", 1000), 0n);
});

// ---- Review surfacing ----

test("a reversal that leaves a contributor in deficit is flagged", () => {
  const result = needsReview(0n, -2186n, "recoup");
  assert.equal(result.needsReview, true);
  assert.match(result.reason!, /already been paid out/);
  assert.match(result.reason!, /\$21\.86/);
});

test("a reversal covered by an existing balance is routine", () => {
  assert.equal(needsReview(5000n, -2186n, "recoup").needsReview, false);
});

test("absorb never needs review — the tenant already decided to eat it", () => {
  assert.equal(needsReview(0n, -2186n, "absorb").needsReview, false);
});

// ---- Event-level reversal ----

function saleEvent(): RevenueEvent {
  return {
    tenantId: TENANT,
    source: "shopify",
    sourceEventId: "order-1:line-1",
    direction: "sale",
    occurredAt: new Date("2026-06-15T00:00:00Z"),
    grossAmountMinor: 9900n,
    currency: "USD",
    quantity: 1,
    contributorRefs: [{ ref: "alice" }],
    costs: [
      { type: "production", amountMinor: 1500n, currency: "USD" },
      { type: "shipping", amountMinor: 800n, currency: "USD" },
      { type: "processing_fee", amountMinor: 312n, currency: "USD" },
    ],
  };
}

test("buildReversal negates gross and every cost", () => {
  const reversal = buildReversal(saleEvent(), {
    sourceEventId: "refund-1",
    occurredAt: new Date("2026-08-01T00:00:00Z"),
  });

  assert.equal(reversal.direction, "reversal");
  assert.equal(reversal.grossAmountMinor, -9900n);
  assert.equal(reversal.reversesSourceEventId, "order-1:line-1");
  assert.deepEqual(
    reversal.costs.map((c) => c.amountMinor),
    [-1500n, -800n, -312n]
  );
  assert.doesNotThrow(() => validateRevenueEvent(reversal));
});

test("re-running the rules over a reversal yields the exact negation", () => {
  // The property that makes refunds clean end to end: same rule, negated
  // inputs, exactly negated output. No residue on the ledger.
  const rule: EvaluableRule = {
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
  };

  const sale = saleEvent();
  const refund = buildReversal(sale, {
    sourceEventId: "refund-1",
    occurredAt: new Date("2026-08-01T00:00:00Z"),
  });

  const context = {
    tenantId: TENANT,
    occurredAt: sale.occurredAt,
    workId: null,
    productType: null,
    contributors: [{ contributorId: ALICE }],
  };

  const saleResult = evaluate([rule], sale, context);
  const refundResult = evaluate([rule], refund, { ...context, occurredAt: refund.occurredAt });

  assert.equal(saleResult.allocations[0].amountMinor, 2186n);
  assert.equal(refundResult.allocations[0].amountMinor, -2186n);

  const ledger: LedgerEntryInput[] = [
    { tenantId: TENANT, contributorId: ALICE, entryType: "allocation", amountMinor: 2186n, currency: "USD", occurredAt: sale.occurredAt },
    { tenantId: TENANT, contributorId: ALICE, entryType: "reversal", amountMinor: -2186n, currency: "USD", occurredAt: refund.occurredAt },
  ];
  assert.equal(deriveBalance(ledger), 0n, "a full refund must leave nothing behind");
});

test("the full §8 lifecycle: earn, pay out, then get charged back", () => {
  // The central case §8 exists for. The money is gone — we never held it — so
  // the contributor goes into deficit and future earnings recoup it.
  const occurredAt = new Date("2026-06-15T00:00:00Z");
  const ledger: LedgerEntryInput[] = [
    { tenantId: TENANT, contributorId: ALICE, entryType: "allocation", amountMinor: 2186n, currency: "USD", occurredAt },
  ];
  assert.equal(deriveBalance(ledger), 2186n);

  // Paid out after the hold period.
  ledger.push({
    tenantId: TENANT, contributorId: ALICE, entryType: "payout",
    amountMinor: -2186n, currency: "USD", occurredAt: new Date("2026-06-29T00:00:00Z"),
  });
  assert.equal(deriveBalance(ledger), 0n);

  // Chargeback arrives 40 days later.
  const reversals = buildReversingAllocations([original()], { reason: "chargeback" });
  const outcome = applyClawbackPolicy(reversals, {
    tenantId: TENANT, policy: "recoup", occurredAt: new Date("2026-08-08T00:00:00Z"),
  });
  ledger.push(...outcome.entries);

  assert.equal(deriveBalance(ledger), -2186n, "contributor is in deficit");
  assert.equal(needsReview(0n, -2186n, "recoup").needsReview, true);

  // A later sale recoups it.
  ledger.push({
    tenantId: TENANT, contributorId: ALICE, entryType: "allocation",
    amountMinor: 3000n, currency: "USD", occurredAt: new Date("2026-09-01T00:00:00Z"),
  });
  assert.equal(deriveBalance(ledger), 814n, "deficit recovered from future earnings");
});

// ---- Event validation ----

test("a reversal with a positive gross is rejected", () => {
  const bad = { ...saleEvent(), direction: "reversal" as const, reversesSourceEventId: "x" };
  assert.throws(() => validateRevenueEvent(bad), EventValidationError);
  assert.throws(() => validateRevenueEvent(bad), /increases earnings/);
});

test("a reversal must reference what it reverses", () => {
  const bad = { ...saleEvent(), direction: "reversal" as const, grossAmountMinor: -9900n };
  assert.throws(() => validateRevenueEvent(bad), /must reference the event/);
});

test("a sale with a negative gross is rejected", () => {
  const bad = { ...saleEvent(), grossAmountMinor: -9900n };
  assert.throws(() => validateRevenueEvent(bad), /record it as a reversal/);
});

test("costs must share the event's currency", () => {
  const bad = saleEvent();
  bad.costs[0].currency = "EUR";
  assert.throws(() => validateRevenueEvent(bad), /but the event is in USD/);
});

test("duplicate cost types are rejected", () => {
  const bad = saleEvent();
  bad.costs.push({ type: "production", amountMinor: 100n, currency: "USD" });
  assert.throws(() => validateRevenueEvent(bad), /Duplicate cost type/);
});

test("an event without a sourceEventId cannot be made idempotent", () => {
  const bad = { ...saleEvent(), sourceEventId: "" };
  assert.throws(() => validateRevenueEvent(bad), /idempotency is impossible/);
});

test("source-supplied shares totalling over 100% are rejected", () => {
  const bad = {
    ...saleEvent(),
    contributorRefs: [
      { ref: "alice", shareBasisPoints: 7000 },
      { ref: "bob", shareBasisPoints: 4000 },
    ],
  };
  assert.throws(() => validateRevenueEvent(bad), /exceeds 100%/);
});
