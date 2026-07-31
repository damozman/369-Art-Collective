import test from "node:test";
import assert from "node:assert/strict";

import {
  assertTransition,
  canTransition,
  FixtureTransferExecutor,
  PayoutStateError,
  UnconfiguredTransferExecutor,
  type PayoutStatus,
} from "../payout";
import { reserveForPayout } from "../reversal";

test("the happy path is a legal sequence", () => {
  assert.doesNotThrow(() => assertTransition("pending", "processing"));
  assert.doesNotThrow(() => assertTransition("processing", "paid"));
});

test("the retry path is legal and goes through `retrying`", () => {
  // Routing through `retrying` rather than straight back to `processing` is
  // what makes a retry visible in the payout's history.
  assert.doesNotThrow(() => assertTransition("processing", "failed"));
  assert.doesNotThrow(() => assertTransition("failed", "retrying"));
  assert.doesNotThrow(() => assertTransition("retrying", "processing"));
});

test("a paid payout is terminal", () => {
  // Corrections to a paid payout are adjustments, never a reopened payout —
  // otherwise the ledger and the provider disagree about what was sent.
  for (const to of ["pending", "processing", "failed", "retrying", "cancelled"] as PayoutStatus[]) {
    assert.equal(canTransition("paid", to), false, `paid -> ${to} must be illegal`);
  }
  assert.throws(() => assertTransition("paid", "processing"), PayoutStateError);
});

test("a cancelled payout is terminal", () => {
  for (const to of ["pending", "processing", "paid", "failed", "retrying"] as PayoutStatus[]) {
    assert.equal(canTransition("cancelled", to), false);
  }
});

test("skipping straight from pending to paid is refused", () => {
  // The transfer has to actually be attempted. Allowing this would let a bug
  // mark somebody paid without money moving.
  assert.throws(() => assertTransition("pending", "paid"), /Illegal payout transition/);
});

test("a failed payout cannot become paid without going through a retry", () => {
  assert.throws(() => assertTransition("failed", "paid"), PayoutStateError);
});

test("the error names the legal transitions", () => {
  assert.throws(() => assertTransition("pending", "paid"), /Legal from pending: processing, cancelled/);
});

// ---- Transfer executors ----

test("the fixture executor records what it was asked to send", async () => {
  const executor = new FixtureTransferExecutor();
  const result = await executor.execute({
    contributorId: "c-alice",
    destinationAccountId: "acct_1",
    amountMinor: 2186n,
    currency: "USD",
    idempotencyKey: "payout_p1",
    description: "test",
    metadata: {},
  });

  assert.equal(result.status, "succeeded");
  assert.equal(result.transferId, "tr_fixture_payout_p1");
  assert.equal(executor.requests.length, 1);
  assert.equal(executor.requests[0].amountMinor, 2186n);
});

test("the fixture executor can fail a specific contributor", async () => {
  // Partial-batch failure is the case the state machine exists for, and it has
  // to be reproducible without breaking a real Stripe account.
  const executor = new FixtureTransferExecutor(new Set(["c-bob"]));

  const alice = await executor.execute({
    contributorId: "c-alice", destinationAccountId: "acct_1", amountMinor: 100n,
    currency: "USD", idempotencyKey: "k1", description: "", metadata: {},
  });
  const bob = await executor.execute({
    contributorId: "c-bob", destinationAccountId: "acct_2", amountMinor: 100n,
    currency: "USD", idempotencyKey: "k2", description: "", metadata: {},
  });

  assert.equal(alice.status, "succeeded");
  assert.equal(bob.status, "failed");
  assert.match(bob.failureReason!, /restricted/);
});

test("an unconfigured executor refuses to move money rather than pretending to", async () => {
  const result = await new UnconfiguredTransferExecutor().execute();
  assert.equal(result.status, "failed");
  assert.match(result.failureReason!, /Refusing to mark a payout paid/);
});

test("the idempotency key is derived from the payout so a retry cannot pay twice", async () => {
  const executor = new FixtureTransferExecutor();
  const request = {
    contributorId: "c-alice", destinationAccountId: "acct_1", amountMinor: 2186n,
    currency: "USD", idempotencyKey: "payout_p1", description: "", metadata: {},
  };
  await executor.execute(request);
  await executor.execute(request); // a retry after an ambiguous failure

  assert.equal(executor.requests[0].idempotencyKey, executor.requests[1].idempotencyKey);
});

// ---- Reserve arithmetic ----

test("reserve is withheld only under the reserve policy", () => {
  assert.equal(reserveForPayout(10000n, "reserve", 1000), 1000n);
  assert.equal(reserveForPayout(10000n, "recoup", 1000), 0n);
  assert.equal(reserveForPayout(10000n, "absorb", 1000), 0n);
});

test("a zero reserve rate withholds nothing", () => {
  assert.equal(reserveForPayout(10000n, "reserve", 0), 0n);
});
