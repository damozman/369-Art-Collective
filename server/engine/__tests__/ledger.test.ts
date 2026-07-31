import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveBalance,
  deriveBalanceAsOf,
  derivePayable,
  entriesForAllocations,
  holdUntil,
  reconcile,
  validateEntry,
  type LedgerEntryInput,
} from "../ledger";

const TENANT = "tenant-1";
const ALICE = "contributor-alice";

function entry(overrides: Partial<LedgerEntryInput> = {}): LedgerEntryInput {
  return {
    tenantId: TENANT,
    contributorId: ALICE,
    entryType: "allocation",
    amountMinor: 2186n,
    currency: "USD",
    occurredAt: new Date("2026-06-15T00:00:00Z"),
    ...overrides,
  };
}

test("balance is derived by summing entries, never stored", () => {
  const entries = [
    entry({ amountMinor: 2186n }),
    entry({ amountMinor: 235n }),
    entry({ entryType: "payout", amountMinor: -2000n }),
  ];
  assert.equal(deriveBalance(entries), 421n);
});

test("balances may legally go negative", () => {
  // A refund after payout puts the contributor in deficit. A model that forbids
  // this has to do something dishonest instead.
  const entries = [
    entry({ amountMinor: 2186n }),
    entry({ entryType: "payout", amountMinor: -2186n }),
    entry({ entryType: "reversal", amountMinor: -2186n }),
  ];
  assert.equal(deriveBalance(entries), -2186n);
});

test("an empty ledger has a zero balance", () => {
  assert.equal(deriveBalance([]), 0n);
});

test("held credits are not payable until they mature", () => {
  const now = new Date("2026-06-20T00:00:00Z");
  const entries = [
    entry({ amountMinor: 1000n, availableAt: new Date("2026-06-18T00:00:00Z") }),
    entry({ amountMinor: 5000n, availableAt: new Date("2026-07-01T00:00:00Z") }),
  ];

  assert.equal(deriveBalance(entries), 6000n, "all of it is earned");
  assert.equal(derivePayable(entries, now), 1000n, "only the matured part is payable");
});

test("debits count immediately even when credits are held", () => {
  // The asymmetry is deliberate: otherwise a contributor with a fresh clawback
  // and a held allocation could be paid money they no longer have.
  const now = new Date("2026-06-20T00:00:00Z");
  const entries = [
    entry({ amountMinor: 5000n, availableAt: new Date("2026-06-01T00:00:00Z") }),
    entry({ amountMinor: 5000n, availableAt: new Date("2026-07-01T00:00:00Z") }),
    entry({ entryType: "reversal", amountMinor: -4000n, availableAt: null }),
  ];

  assert.equal(derivePayable(entries, now), 1000n);
});

test("a negative balance is never payable", () => {
  const now = new Date("2026-06-20T00:00:00Z");
  const entries = [
    entry({ amountMinor: 1000n, availableAt: null }),
    entry({ entryType: "reversal", amountMinor: -3000n }),
  ];
  assert.equal(derivePayable(entries, now), 0n);
});

test("balance as of an instant reconstructs a historical statement", () => {
  const entries = [
    entry({ amountMinor: 1000n, occurredAt: new Date("2026-05-01T00:00:00Z") }),
    entry({ amountMinor: 2000n, occurredAt: new Date("2026-06-01T00:00:00Z") }),
    entry({ amountMinor: 4000n, occurredAt: new Date("2026-07-01T00:00:00Z") }),
  ];

  assert.equal(deriveBalanceAsOf(entries, new Date("2026-06-15T00:00:00Z")), 3000n);
  assert.equal(deriveBalanceAsOf(entries, new Date("2026-12-31T00:00:00Z")), 7000n);
});

test("holdUntil applies the tenant's hold period", () => {
  const occurred = new Date("2026-06-15T00:00:00Z");
  assert.equal(holdUntil(occurred, 14).toISOString(), "2026-06-29T00:00:00.000Z");
  assert.equal(holdUntil(occurred, 0).toISOString(), "2026-06-15T00:00:00.000Z");
});

// ---- Validation ----

test("a zero-amount entry is refused", () => {
  // Always a symptom — a rule that should not have matched, or a rounding bug.
  assert.throws(() => validateEntry(entry({ amountMinor: 0n })), /zero-amount/);
});

test("entry signs are enforced by type", () => {
  assert.throws(() => validateEntry(entry({ entryType: "allocation", amountMinor: -5n })), /must be positive/);
  assert.throws(() => validateEntry(entry({ entryType: "reversal", amountMinor: 5n })), /must be negative/);
  assert.throws(() => validateEntry(entry({ entryType: "payout", amountMinor: 5n })), /must be negative/);
  assert.throws(() => validateEntry(entry({ entryType: "payout_reversal", amountMinor: -5n })), /must be positive/);
});

test("adjustments may be either sign", () => {
  assert.doesNotThrow(() => validateEntry(entry({ entryType: "adjustment", amountMinor: 500n })));
  assert.doesNotThrow(() => validateEntry(entry({ entryType: "adjustment", amountMinor: -500n })));
});

test("entries must be tenant-scoped and carry a currency", () => {
  assert.throws(() => validateEntry(entry({ tenantId: "" })), /tenantId/);
  assert.throws(() => validateEntry(entry({ contributorId: "" })), /contributorId/);
  assert.throws(() => validateEntry(entry({ currency: "" })), /currency/);
});

// ---- Building entries from allocations ----

test("allocations become held credits, reversals become immediate debits", () => {
  const occurredAt = new Date("2026-06-15T00:00:00Z");

  const credits = entriesForAllocations(
    [{ id: "a1", contributorId: ALICE, amountMinor: 2186n, currency: "USD", explanation: "why" }],
    { tenantId: TENANT, occurredAt, payoutHoldDays: 14, isReversal: false }
  );
  assert.equal(credits[0].entryType, "allocation");
  assert.equal(credits[0].availableAt?.toISOString(), "2026-06-29T00:00:00.000Z");

  const debits = entriesForAllocations(
    [{ id: "a1", contributorId: ALICE, amountMinor: -2186n, currency: "USD" }],
    { tenantId: TENANT, occurredAt, payoutHoldDays: 14, isReversal: true }
  );
  assert.equal(debits[0].entryType, "reversal");
  assert.equal(debits[0].availableAt, null, "clawbacks are never delayed");
});

test("zero-amount allocations produce no ledger entries", () => {
  const entries = entriesForAllocations(
    [{ id: "a1", contributorId: ALICE, amountMinor: 0n, currency: "USD" }],
    { tenantId: TENANT, occurredAt: new Date(), payoutHoldDays: 14, isReversal: false }
  );
  assert.equal(entries.length, 0);
});

// ---- Reconciliation ----

test("reconcile confirms the ledger matches what was allocated", () => {
  const entries = [
    entry({ entryType: "allocation", amountMinor: 2186n }),
    entry({ entryType: "allocation", amountMinor: 729n }),
    entry({ entryType: "payout", amountMinor: -2915n }),
  ];

  const result = reconcile(entries, 2915n);
  assert.equal(result.reconciled, true);
  assert.equal(result.ledgerTotalMinor, 2915n, "payouts are excluded from the comparison");
  assert.equal(result.differenceMinor, 0n);
});

test("reconcile detects a ledger that has drifted from its allocations", () => {
  const entries = [entry({ entryType: "allocation", amountMinor: 2186n })];
  const result = reconcile(entries, 2915n);

  assert.equal(result.reconciled, false);
  assert.equal(result.differenceMinor, -729n);
});

test("a full round trip reconciles to zero", () => {
  const entries = [
    entry({ entryType: "allocation", amountMinor: 2186n }),
    entry({ entryType: "reversal", amountMinor: -2186n }),
  ];
  assert.equal(deriveBalance(entries), 0n);
  assert.equal(reconcile(entries, 0n).reconciled, true);
});
