import test from "node:test";
import assert from "node:assert/strict";

import {
  buildStatement,
  renderStatementText,
  type StatementSourceRow,
} from "../statement";

const PERIOD_START = new Date("2026-06-01T00:00:00Z");
const PERIOD_END = new Date("2026-06-30T23:59:59Z");

function row(overrides: Partial<StatementSourceRow> = {}): StatementSourceRow {
  return {
    occurredAt: new Date("2026-06-15T00:00:00Z"),
    entryType: "allocation",
    amountMinor: 2186n,
    currency: "USD",
    availableAt: null,
    description: null,
    ...overrides,
  };
}

function statement(rows: StatementSourceRow[], opts: Partial<Parameters<typeof buildStatement>[0]> = {}) {
  return buildStatement({
    contributorId: "c-alice",
    contributorName: "Alice",
    tenantName: "369 Art Collective",
    currency: "USD",
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    asOf: PERIOD_END,
    priorRows: [],
    rows,
    ...opts,
  });
}

test("a statement carries the STORED explanation, not a regenerated one", () => {
  // The whole point of §5 #6. Recomputing would answer "what would this earn
  // under today's rules", which is a different question.
  const stored = "Gross $99.00; Net $72.88; 30% of net $21.86 [rule artist-standard v3]";
  const s = statement([
    row({ allocationExplanation: stored, ruleKey: "artist-standard", ruleVersion: 3 }),
  ]);

  assert.equal(s.lines[0].explanation, stored);
  assert.equal(s.lines[0].ruleVersion, 3);
});

test("the ledger description is the fallback when there is no allocation", () => {
  // Payouts and manual adjustments have no allocation behind them.
  const s = statement([
    row({ entryType: "payout", amountMinor: -2186n, description: "Payout p-1" }),
  ]);
  assert.equal(s.lines[0].explanation, "Payout p-1");
});

test("opening balance comes from everything before the period", () => {
  const s = statement([row()], { priorRows: [{ amountMinor: 5000n }, { amountMinor: -1000n }] });
  assert.equal(s.openingBalanceMinor, 4000n);
  assert.equal(s.totals.closingBalanceMinor, 4000n + 2186n);
});

test("totals separate earnings, reversals, adjustments and payouts", () => {
  const s = statement([
    row({ amountMinor: 2186n }),
    row({ amountMinor: 729n }),
    row({ entryType: "reversal", amountMinor: -500n }),
    row({ entryType: "adjustment", amountMinor: 100n }),
    row({ entryType: "payout", amountMinor: -1000n }),
  ]);

  assert.equal(s.totals.earnedMinor, 2915n);
  assert.equal(s.totals.reversedMinor, -500n);
  assert.equal(s.totals.adjustmentsMinor, 100n);
  assert.equal(s.totals.paidOutMinor, -1000n);
  assert.equal(s.totals.closingBalanceMinor, 1515n);
});

test("lines are ordered by when they happened", () => {
  const s = statement([
    row({ occurredAt: new Date("2026-06-20T00:00:00Z"), amountMinor: 300n }),
    row({ occurredAt: new Date("2026-06-05T00:00:00Z"), amountMinor: 100n }),
    row({ occurredAt: new Date("2026-06-12T00:00:00Z"), amountMinor: 200n }),
  ]);
  assert.deepEqual(s.lines.map((l) => l.amountMinor), [100n, 200n, 300n]);
});

// ---- Holds ----

test("a credit inside the hold window is marked held and is not payable", () => {
  const s = statement([
    row({ amountMinor: 5000n, availableAt: new Date("2026-07-15T00:00:00Z") }),
  ]);

  assert.equal(s.lines[0].held, true);
  assert.equal(s.totals.closingBalanceMinor, 5000n, "it is earned");
  assert.equal(s.totals.heldMinor, 5000n);
  assert.equal(s.totals.payableNowMinor, 0n, "but not yet payable");
});

test("a credit whose hold has matured is payable", () => {
  const s = statement([
    row({ amountMinor: 5000n, availableAt: new Date("2026-06-10T00:00:00Z") }),
  ]);
  assert.equal(s.lines[0].held, false);
  assert.equal(s.totals.payableNowMinor, 5000n);
});

test("debits are never treated as held", () => {
  // A clawback applies immediately; it is not "not yet deducted".
  const s = statement([
    row({ entryType: "reversal", amountMinor: -2186n, availableAt: new Date("2027-01-01T00:00:00Z") }),
  ]);
  assert.equal(s.lines[0].held, false);
});

test("asOf is respected so a past statement reproduces exactly", () => {
  // Regenerating last quarter's statement must not move its hold column just
  // because time has passed.
  const rows = [row({ amountMinor: 5000n, availableAt: new Date("2026-06-20T00:00:00Z") })];

  const asOfBefore = statement(rows, { asOf: new Date("2026-06-15T00:00:00Z") });
  const asOfAfter = statement(rows, { asOf: new Date("2026-06-25T00:00:00Z") });

  assert.equal(asOfBefore.totals.heldMinor, 5000n);
  assert.equal(asOfAfter.totals.heldMinor, 0n);
});

// ---- Negative balances ----

test("a negative closing balance is explained rather than hidden", () => {
  const s = statement([row({ entryType: "reversal", amountMinor: -2186n })]);

  assert.equal(s.totals.closingBalanceMinor, -2186n);
  assert.equal(s.totals.payableNowMinor, 0n);
  assert.match(s.summary, /more was refunded than earned/);
  assert.match(s.summary, /Nothing is owed back/);
});

// ---- Summary ----

test("the summary reads plainly and names the reason for a smaller number", () => {
  const s = statement([
    row({ amountMinor: 2186n }),
    row({ entryType: "reversal", amountMinor: -500n }),
    row({ entryType: "payout", amountMinor: -1000n }),
  ]);

  assert.match(s.summary, /Alice earned \$21\.86 this period/);
  assert.match(s.summary, /less \$5\.00 reversed from refunds or chargebacks/);
  assert.match(s.summary, /was paid \$10\.00/);
  assert.match(s.summary, /Closing balance \$6\.86/);
});

test("the summary mentions holds when some of the balance is not yet available", () => {
  const s = statement([
    row({ amountMinor: 5000n, availableAt: new Date("2026-07-15T00:00:00Z") }),
    row({ amountMinor: 1000n, availableAt: new Date("2026-06-05T00:00:00Z") }),
  ]);

  assert.match(s.summary, /\$50\.00 is still within the refund window/);
  assert.match(s.summary, /\$10\.00 is available now/);
});

test("a quiet period says so instead of rendering an empty table", () => {
  const s = statement([]);
  assert.equal(s.lines.length, 0);
  assert.equal(s.totals.closingBalanceMinor, 0n);
  assert.match(renderStatementText(s), /No activity this period/);
});

// ---- Text rendering ----

test("the text rendering includes the derivation under each line", () => {
  const s = statement([
    row({
      allocationExplanation: "Gross $99.00; Net $72.88; 30% of net $21.86 [rule artist-standard v3]",
      workTitle: "Sunset",
    }),
  ]);

  const text = renderStatementText(s);
  assert.match(text, /Statement for Alice — 369 Art Collective/);
  assert.match(text, /2026-06-15/);
  assert.match(text, /Sunset/);
  assert.match(text, /30% of net \$21\.86/);
  assert.match(text, /Closing:/);
});

test("held lines are flagged in the text rendering", () => {
  const s = statement([
    row({ amountMinor: 5000n, availableAt: new Date("2026-07-15T00:00:00Z") }),
  ]);
  assert.match(renderStatementText(s), /\[held\]/);
});
