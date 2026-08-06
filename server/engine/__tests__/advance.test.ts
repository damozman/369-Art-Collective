/**
 * Advance recoupment — the pure half. No database, no clock.
 *
 * `planRecoupment` decides how much of somebody's payment is taken back against
 * money they were given up front. It is the one piece of this feature that
 * arithmetic can get wrong quietly, so it is tested hard here; the DB-facing
 * half is proved in `e2e.ts` against real Postgres.
 *
 * Every test below corresponds to a numbered decision in `advance.ts`'s header.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  AdvanceError,
  outstandingMinor,
  planRecoupment,
  validateAdvance,
  type RecoupableAdvance,
} from "../advance";

function advance(overrides: Partial<RecoupableAdvance> = {}): RecoupableAdvance {
  return {
    id: "adv-1",
    amountMinor: 100000n, // $1,000
    recoupedMinor: 0n,
    recoupmentBasisPoints: 10000, // 100%
    currency: "USD",
    issuedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

// ============================================================
// Outstanding
// ============================================================

test("outstanding is what is left to recover", () => {
  assert.equal(outstandingMinor(advance({ recoupedMinor: 30000n })), 70000n);
});

test("an over-recouped advance floors at zero rather than going negative", () => {
  // A negative "outstanding" would be read as the business owing the
  // contributor, which is a different thing entirely.
  assert.equal(outstandingMinor(advance({ recoupedMinor: 150000n })), 0n);
});

// ============================================================
// The basic shape
// ============================================================

test("with no advances, the whole payment goes to the person", () => {
  const plan = planRecoupment(50000n, []);
  assert.equal(plan.totalMinor, 0n);
  assert.equal(plan.netPayableMinor, 50000n);
  assert.equal(plan.applications.length, 0);
});

test("a full-rate advance takes the whole payment until it is clear", () => {
  const plan = planRecoupment(30000n, [advance()]);
  assert.equal(plan.totalMinor, 30000n);
  assert.equal(plan.netPayableMinor, 0n);
  assert.equal(plan.applications[0].remainingMinor, 70000n);
});

/**
 * ⚠️ DECISION 1, and the reason advances are not just a negative balance.
 *
 * A rate below 100% means the contributor keeps seeing money while the advance
 * clears. A deficit in the ledger could only ever express 100%, which is why
 * the recoupable balance lives beside the ledger balance rather than inside it.
 */
test("a half-rate advance leaves half the payment with the person", () => {
  const plan = planRecoupment(
    40000n,
    [advance({ recoupmentBasisPoints: 5000 })]
  );

  assert.equal(plan.totalMinor, 20000n);
  assert.equal(plan.netPayableMinor, 20000n);
});

test("recoupment never exceeds what is still owed", () => {
  // $50 payment, only $12 left on the advance.
  const plan = planRecoupment(5000n, [advance({ recoupedMinor: 98800n })]);

  assert.equal(plan.totalMinor, 1200n);
  assert.equal(plan.netPayableMinor, 3800n);
  assert.equal(plan.applications[0].remainingMinor, 0n);
});

test("a cleared advance takes nothing", () => {
  const plan = planRecoupment(50000n, [advance({ recoupedMinor: 100000n })]);
  assert.equal(plan.totalMinor, 0n);
  assert.equal(plan.netPayableMinor, 50000n);
});

test("nothing payable means nothing recouped", () => {
  // Recoupment applies to money that is ready to go out. Taking against a zero
  // or negative balance would push somebody further into deficit for a debt
  // that is already being tracked separately.
  assert.equal(planRecoupment(0n, [advance()]).totalMinor, 0n);
  assert.equal(planRecoupment(-5000n, [advance()]).totalMinor, 0n);
});

test("a negative payable never produces a negative net", () => {
  assert.equal(planRecoupment(-5000n, []).netPayableMinor, 0n);
});

// ============================================================
// Several advances at once
// ============================================================

test("advances are paid down oldest first", () => {
  const older = advance({ id: "adv-old", issuedAt: new Date("2026-01-01T00:00:00Z") });
  const newer = advance({ id: "adv-new", issuedAt: new Date("2026-06-01T00:00:00Z") });

  // Deliberately passed newest-first, to prove the sort rather than the input.
  const plan = planRecoupment(150000n, [newer, older]);

  assert.equal(plan.applications[0].advanceId, "adv-old");
  assert.equal(plan.applications[1].advanceId, "adv-new");
});

test("two advances issued the same instant still order deterministically", () => {
  const sameDay = new Date("2026-01-01T00:00:00Z");
  const a = advance({ id: "adv-b", issuedAt: sameDay });
  const b = advance({ id: "adv-a", issuedAt: sameDay });

  const first = planRecoupment(150000n, [a, b]);
  const second = planRecoupment(150000n, [b, a]);

  // A plan that depended on input order would make the same run produce
  // different ledger entries on a retry.
  assert.deepEqual(
    first.applications.map((x) => x.advanceId),
    second.applications.map((x) => x.advanceId)
  );
  assert.equal(first.applications[0].advanceId, "adv-a");
});

/**
 * ⚠️ DECISION 2 — the ambiguity a real contract has to settle.
 *
 * Two advances at 60% must not between them take 120% of a payment. The cap is
 * ONE rate applied ONCE, and it is the highest, which honours the stricter of
 * the two clauses the business actually agreed to.
 */
test("two advances cannot together take more than the highest single rate", () => {
  const plan = planRecoupment(10000n, [
    advance({ id: "a", recoupmentBasisPoints: 6000 }),
    advance({ id: "b", recoupmentBasisPoints: 6000 }),
  ]);

  assert.equal(plan.totalMinor, 6000n, "60% of the payment, not 120%");
  assert.equal(plan.netPayableMinor, 4000n);
});

test("the capping rate is the highest, not the lowest or the average", () => {
  const plan = planRecoupment(10000n, [
    advance({ id: "a", recoupmentBasisPoints: 2500 }),
    advance({ id: "b", recoupmentBasisPoints: 7500 }),
  ]);

  assert.equal(plan.totalMinor, 7500n);
});

test("recoupment can never exceed the payment itself", () => {
  const plan = planRecoupment(10000n, [
    advance({ id: "a", recoupmentBasisPoints: 10000 }),
    advance({ id: "b", recoupmentBasisPoints: 10000 }),
    advance({ id: "c", recoupmentBasisPoints: 10000 }),
  ]);

  assert.equal(plan.totalMinor, 10000n);
  assert.equal(plan.netPayableMinor, 0n);
});

test("the applications always sum to the total", () => {
  const plan = planRecoupment(87654n, [
    advance({ id: "a", amountMinor: 20000n, recoupmentBasisPoints: 8000 }),
    advance({ id: "b", amountMinor: 30000n, recoupmentBasisPoints: 5000 }),
    advance({ id: "c", amountMinor: 40000n, recoupmentBasisPoints: 3000 }),
  ]);

  const summed = plan.applications.reduce((total, a) => total + a.amountMinor, 0n);
  assert.equal(summed, plan.totalMinor);
});

test("the net plus what was taken always equals what was payable", () => {
  // The invariant that matters: money is never created or destroyed by a plan.
  for (const payable of [1n, 999n, 10000n, 123456n, 7654321n]) {
    const plan = planRecoupment(payable, [
      advance({ id: "a", amountMinor: 50000n, recoupmentBasisPoints: 4000 }),
      advance({ id: "b", amountMinor: 50000n, recoupmentBasisPoints: 7000 }),
    ]);

    assert.equal(
      plan.netPayableMinor + plan.totalMinor,
      payable,
      `broke at ${payable}`
    );
  }
});

test("a cleared advance is skipped without disturbing the others", () => {
  const plan = planRecoupment(50000n, [
    advance({ id: "cleared", recoupedMinor: 100000n }),
    advance({ id: "open", issuedAt: new Date("2026-02-01T00:00:00Z") }),
  ]);

  assert.equal(plan.applications.length, 1);
  assert.equal(plan.applications[0].advanceId, "open");
});

test("a rounding-sensitive rate does not lose or invent a unit", () => {
  // 33.33% of 1 cent rounds to zero; the person keeps the cent.
  const plan = planRecoupment(1n, [advance({ recoupmentBasisPoints: 3333 })]);
  assert.equal(plan.totalMinor + plan.netPayableMinor, 1n);
});

// ============================================================
// Validation
// ============================================================

test("a valid advance passes", () => {
  assert.doesNotThrow(() =>
    validateAdvance({ amountMinor: 50000n, recoupmentBasisPoints: 5000, currency: "USD" })
  );
});

test("a zero or negative advance is refused", () => {
  for (const amount of [0n, -100n]) {
    assert.throws(
      () => validateAdvance({ amountMinor: amount, recoupmentBasisPoints: 5000, currency: "USD" }),
      AdvanceError
    );
  }
});

/**
 * A zero-rate advance would never recoup — it is a gift wearing an advance's
 * clothes, and it would sit on the books forever looking like money owed.
 */
test("a zero recoupment rate is refused", () => {
  assert.throws(
    () => validateAdvance({ amountMinor: 50000n, recoupmentBasisPoints: 0, currency: "USD" }),
    AdvanceError
  );
});

test("a rate above 100% is refused", () => {
  assert.throws(
    () => validateAdvance({ amountMinor: 50000n, recoupmentBasisPoints: 10001, currency: "USD" }),
    AdvanceError
  );
});

test("exactly 100% is allowed — it is the commonest deal there is", () => {
  assert.doesNotThrow(() =>
    validateAdvance({ amountMinor: 50000n, recoupmentBasisPoints: 10000, currency: "USD" })
  );
});

test("a fractional basis-point rate is refused rather than rounded", () => {
  assert.throws(
    () => validateAdvance({ amountMinor: 50000n, recoupmentBasisPoints: 5000.5, currency: "USD" }),
    AdvanceError
  );
});

test("an advance without a currency is refused", () => {
  assert.throws(
    () => validateAdvance({ amountMinor: 50000n, recoupmentBasisPoints: 5000, currency: "" }),
    AdvanceError
  );
});
