/**
 * Payout-account status presentation, with no database.
 *
 * The DB-facing half (one account per contributor, never inventing "ready") is
 * proved in `e2e.ts` against real Postgres. What is proved here is the part a
 * contributor actually reads: that a not-yet-approved account never says it is
 * ready, and that Stripe's requirement keys become English.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  describeRequirements,
  toPayoutAccountStatus,
} from "../payout-account";
import type { ContributorIdentity } from "@shared/engine-schema";

function identity(overrides: Partial<ContributorIdentity> = {}): ContributorIdentity {
  return {
    id: "id-1",
    tenantId: "t-1",
    contributorId: "c-1",
    stripeAccountId: "acct_1",
    stripePayoutsEnabled: false,
    stripeRequirements: null,
    taxFormType: null,
    taxIdentityStatus: "not_collected",
    taxIdentityCollectedAt: null,
    payoutCurrency: "USD",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ContributorIdentity;
}

test("no identity at all reads as not started", () => {
  const status = toPayoutAccountStatus(null);
  assert.equal(status.state, "not_started");
  assert.equal(status.canReceivePayouts, false);
});

test("an identity with no Stripe account reads as not started", () => {
  // The row can exist for other reasons — tax details, payout currency —
  // without anyone having connected a bank.
  const status = toPayoutAccountStatus(identity({ stripeAccountId: null }));
  assert.equal(status.state, "not_started");
  assert.equal(status.canReceivePayouts, false);
});

test("submitting the form is not the same as being ready", () => {
  // The failure this prevents: telling someone they are set up because they
  // reached the return URL, then failing every payout they are picked up in.
  const status = toPayoutAccountStatus(
    identity({
      stripePayoutsEnabled: false,
      stripeRequirements: {
        detailsSubmitted: true,
        currentlyDue: ["individual.verification.document"],
        disabledReason: null,
      },
    })
  );

  assert.equal(status.state, "pending");
  assert.equal(status.canReceivePayouts, false);
  assert.deepEqual(status.outstanding, ["A photo of your ID"]);
});

test("only Stripe's own payouts_enabled makes an account ready", () => {
  const status = toPayoutAccountStatus(
    identity({
      stripePayoutsEnabled: true,
      stripeRequirements: { detailsSubmitted: true, currentlyDue: [], disabledReason: null },
    })
  );

  assert.equal(status.state, "ready");
  assert.equal(status.canReceivePayouts, true);
});

test("a suspended account reads as restricted, not merely pending", () => {
  // Different problem, different action: pending means "finish the form",
  // restricted means "Stripe has stopped paying you".
  const status = toPayoutAccountStatus(
    identity({
      stripePayoutsEnabled: false,
      stripeRequirements: {
        detailsSubmitted: true,
        currentlyDue: ["individual.verification.additional_document"],
        disabledReason: "requirements.past_due",
      },
    })
  );

  assert.equal(status.state, "restricted");
  assert.equal(status.canReceivePayouts, false);
});

test("an account that is ready but has future requirements still shows them", () => {
  // Stripe asks for more paperwork ahead of a volume threshold while payouts
  // still work. Hiding it turns a warning into a surprise suspension.
  const status = toPayoutAccountStatus(
    identity({
      stripePayoutsEnabled: true,
      stripeRequirements: {
        detailsSubmitted: true,
        currentlyDue: ["individual.id_number"],
        disabledReason: null,
      },
    })
  );

  assert.equal(status.state, "ready");
  assert.equal(status.canReceivePayouts, true);
  assert.deepEqual(status.outstanding, ["Your tax ID number (SSN in the US)"]);
});

test("requirement keys are translated, and unknown ones pass through", () => {
  assert.deepEqual(
    describeRequirements(["external_account", "individual.dob.day", "some.new.key"]),
    ["Bank account details", "Your date of birth", "some.new.key"]
  );
});

test("the status a contributor sees never contains their Stripe account id", () => {
  const status = toPayoutAccountStatus(
    identity({ stripeAccountId: "acct_secret_identifier", stripePayoutsEnabled: true })
  );
  assert.ok(!JSON.stringify(status).includes("acct_secret_identifier"));
});

test("the last-checked time round-trips out of the stored blob", () => {
  const status = toPayoutAccountStatus(
    identity({
      stripeRequirements: { checkedAt: "2026-07-31T12:00:00.000Z", currentlyDue: [] },
    })
  );
  assert.equal(status.lastCheckedAt?.toISOString(), "2026-07-31T12:00:00.000Z");
});
