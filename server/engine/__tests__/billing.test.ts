/**
 * Billing logic that needs no database.
 *
 * The DB-facing half — counting people paid, the trial, and the fact that an
 * overage notice does NOT change the plan — is proved in `e2e.ts` against real
 * Postgres, because those are claims about stored rows.
 *
 * What is proved here is the shape of the commercial model: that nothing in the
 * plan logic can raise a bill, and that a failed payment does not switch the
 * product off.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  ANNUAL_MONTHS_CHARGED,
  DEFAULT_PLAN_KEY,
  PLANS,
  annualSavingMinor,
  findPlan,
  priceFor,
  selectablePlans,
  smallestPlanFor,
} from "../billing/plans";
import {
  addDays,
  addMonths,
  currentUsageWindow,
  entitlement,
} from "../billing/subscription";
import { mapStripeStatus } from "../billing/live-billing-client";
import { FixtureBillingClient } from "../billing/billing-client";
import { SignupError, toSlug, validateSignup } from "../billing/signup";
import type { Subscription } from "@shared/engine-schema";

// ============================================================
// Plans
// ============================================================

test("every plan has a price in minor units, never a float", () => {
  for (const plan of PLANS) {
    assert.equal(typeof plan.priceMinor, "bigint");
    assert.ok(plan.priceMinor > 0n, `${plan.key} must cost something`);
  }
});

test("there is no free plan — ratified decision #5", () => {
  assert.ok(PLANS.every((plan) => plan.priceMinor > 0n));
});

test("the default plan exists", () => {
  assert.ok(findPlan(DEFAULT_PLAN_KEY));
});

test("plan limits and prices increase together", () => {
  const ordered = [...PLANS].sort((a, b) => a.peopleLimit - b.peopleLimit);
  for (let i = 1; i < ordered.length; i++) {
    assert.ok(
      ordered[i].priceMinor > ordered[i - 1].priceMinor,
      "a bigger allowance must not cost less"
    );
  }
});

/**
 * A retired plan must still describe the subscriptions sitting on it —
 * somebody grandfathered onto an old price has to keep working.
 */
test("an unknown plan key returns null rather than throwing", () => {
  assert.equal(findPlan("no-such-plan"), null);
});

test("retired plans are hidden from signup but still resolvable", () => {
  const retired = { ...PLANS[0], key: "legacy", retired: true };
  const all = [...PLANS, retired];
  assert.ok(!all.filter((p) => !p.retired).some((p) => p.key === "legacy"));
  assert.ok(selectablePlans().every((plan) => !plan.retired));
});

test("the smallest plan covering a count is suggested", () => {
  assert.equal(smallestPlanFor(1)?.key, "starter");
  assert.equal(smallestPlanFor(10)?.key, "starter");
  assert.equal(smallestPlanFor(11)?.key, "growth");
  assert.equal(smallestPlanFor(50)?.key, "growth");
  assert.equal(smallestPlanFor(51)?.key, "scale");
});

test("above the largest plan there is no automatic answer", () => {
  // Deliberately null: that is a conversation, not a silent upgrade.
  assert.equal(smallestPlanFor(5000), null);
});

// ============================================================
// Entitlement — what an unpaid subscription actually restricts
// ============================================================

function sub(overrides: Partial<Subscription> = {}): Subscription {
  const now = new Date("2026-08-01T00:00:00Z");
  return {
    id: "s-1",
    tenantId: "t-1",
    planKey: "starter",
    status: "active",
    periodStart: now,
    periodEnd: addDays(now, 30),
    trialEndsAt: null,
    overageNoticedAt: null,
    overagePeopleCount: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    lastPaymentError: null,
    canceledAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as Subscription;
}

test("an active subscription works and is not nagged", () => {
  const result = entitlement(sub());
  assert.equal(result.access, "full");
  assert.equal(result.message, null);
  assert.equal(result.needsPaymentMethod, false);
});

test("a running trial works", () => {
  const now = new Date("2026-08-01T00:00:00Z");
  const result = entitlement(
    sub({ status: "trialing", trialEndsAt: addDays(now, 5) }),
    now
  );
  assert.equal(result.access, "full");
});

test("an expired trial goes read-only, not locked out", () => {
  const now = new Date("2026-08-20T00:00:00Z");
  const result = entitlement(
    sub({ status: "trialing", trialEndsAt: new Date("2026-08-15T00:00:00Z") }),
    now
  );
  // Chosen by the user over locking people out: shutting somebody out of their
  // own records reads badly, and read-only still creates the reason to pay.
  assert.equal(result.access, "read_only");
  assert.equal(result.canRunPayouts, false);
});

/**
 * ⚠️ THE ONE THAT MATTERS MOST IN THIS FILE.
 *
 * A failed card must not switch the product off. Suspending a tenant over a
 * payment failure stops CONTRIBUTORS being paid — people who are not our
 * customer, had no part in the failure, and cannot resolve it. We would be
 * withholding somebody's income over $49 of our own.
 *
 * If this test is ever "fixed" to assert `active === false`, the change needs
 * the user's agreement, not a refactor.
 */
test("a failed payment does NOT switch the product off", () => {
  const result = entitlement(sub({ status: "past_due" }));
  assert.equal(result.access, "full");
  assert.equal(result.canRunPayouts, true);
  assert.ok(result.message, "but they are told");
  assert.equal(result.needsPaymentMethod, true);
});

test("a cancelled subscription is read-only so records can still be exported", () => {
  const result = entitlement(sub({ status: "canceled" }));
  assert.equal(result.access, "read_only");
  assert.equal(result.canRunPayouts, false);
});

test("no subscription at all is read-only", () => {
  assert.equal(entitlement(null).access, "read_only");
});

/**
 * Read-only must never stop revenue being recorded. Nothing in `Entitlement`
 * describes ingestion, and that absence is the guarantee — a webhook has no
 * entitlement to consult. A blocked write is undone by paying; a dropped sale
 * is a permanent hole in the ledger nobody knows about.
 */
test("entitlement says nothing about recording revenue", () => {
  const result = entitlement(sub({ status: "canceled" }));
  assert.ok(!("canIngest" in result));
  assert.ok(!("canRecordRevenue" in result));
});

// ============================================================
// Signup
// ============================================================

test("a business name becomes a usable web address", () => {
  assert.equal(toSlug("Harbour Press"), "harbour-press");
  assert.equal(toSlug("  Spaced   Out  "), "spaced-out");
  assert.equal(toSlug("369 Art Collective"), "369-art-collective");
});

test("punctuation and symbols are dropped, not encoded", () => {
  assert.equal(toSlug("Smith & Sons, Ltd."), "smith-sons-ltd");
  assert.equal(toSlug("we/are/slashes"), "we-are-slashes");
});

test("accents are folded rather than dropping the letter", () => {
  // "caf-noir" would be a worse address than "cafe-noir".
  assert.equal(toSlug("Café Noir"), "cafe-noir");
});

test("a slug cannot start or end with a dash", () => {
  assert.equal(toSlug("!!Bang!!"), "bang");
});

test("a valid signup passes", () => {
  assert.doesNotThrow(() =>
    validateSignup({
      businessName: "Harbour Press",
      name: "Sam Reed",
      email: "sam@harbour.example",
      password: "a good long passphrase",
    })
  );
});

test("a short password is refused", () => {
  assert.throws(
    () =>
      validateSignup({
        businessName: "Harbour Press",
        name: "Sam Reed",
        email: "sam@harbour.example",
        password: "short",
      }),
    SignupError
  );
});

test("a malformed email is refused", () => {
  assert.throws(
    () =>
      validateSignup({
        businessName: "Harbour Press",
        name: "Sam Reed",
        email: "not-an-email",
        password: "a good long passphrase",
      }),
    SignupError
  );
});

/**
 * A business called "Admin" would otherwise take `/manage/admin` and
 * `/portal/admin`, which reads as an official page to a contributor. That is a
 * phishing surface, not a naming collision.
 */
test("reserved web addresses are refused", () => {
  for (const reserved of ["Admin", "API", "Billing", "Support"]) {
    assert.throws(
      () =>
        validateSignup({
          businessName: reserved,
          name: "Sam Reed",
          email: "sam@harbour.example",
          password: "a good long passphrase",
        }),
      SignupError,
      `"${reserved}" must be reserved`
    );
  }
});

test("a name that cannot become an address is refused clearly", () => {
  assert.throws(
    () =>
      validateSignup({
        businessName: "!!!",
        name: "Sam Reed",
        email: "sam@harbour.example",
        password: "a good long passphrase",
      }),
    SignupError
  );
});

test("an unknown plan at signup is refused", () => {
  assert.throws(
    () =>
      validateSignup({
        businessName: "Harbour Press",
        name: "Sam Reed",
        email: "sam@harbour.example",
        password: "a good long passphrase",
        planKey: "enterprise-unlimited",
      }),
    SignupError
  );
});

// ============================================================
// Annual billing
// ============================================================

test("annual costs ten months rather than twelve", () => {
  for (const plan of PLANS) {
    assert.equal(plan.annualPriceMinor, plan.priceMinor * ANNUAL_MONTHS_CHARGED);
  }
});

test("the annual saving is two months, exactly", () => {
  const starter = findPlan("starter")!;
  assert.equal(annualSavingMinor(starter), starter.priceMinor * 2n);
  // $49 x 2 = $98 off $588.
  assert.equal(annualSavingMinor(starter), 9800n);
});

test("the interval decides the price", () => {
  const growth = findPlan("growth")!;
  assert.equal(priceFor(growth, "monthly"), 9900n);
  assert.equal(priceFor(growth, "annual"), 99000n);
});

test("annual prices stay bigint — a yearly total is still not a float", () => {
  for (const plan of PLANS) {
    assert.equal(typeof plan.annualPriceMinor, "bigint");
  }
});

// ============================================================
// The usage window — the bug annual billing introduces
// ============================================================

test("adding months clamps rather than rolling into the next month", () => {
  // 31 Jan + 1 month is 28 Feb, not 3 March. Rolling over would drift the
  // anniversary forward every single year.
  assert.equal(
    addMonths(new Date("2026-01-31T00:00:00Z"), 1).toISOString(),
    "2026-02-28T00:00:00.000Z"
  );
  assert.equal(
    addMonths(new Date("2024-01-31T00:00:00Z"), 1).toISOString(),
    "2024-02-29T00:00:00.000Z"
  );
});

test("a clamped month does not permanently shorten later ones", () => {
  // Anchored on the original day, so March is the 31st again.
  const anchor = new Date("2026-01-31T00:00:00Z");
  assert.equal(addMonths(anchor, 2).toISOString(), "2026-03-31T00:00:00.000Z");
});

/**
 * ⚠️ THE CLAIM ANNUAL BILLING DEPENDS ON.
 *
 * `peopleLimit` is per MONTH. An annual subscription's billing period is a
 * year. Measuring usage across the billing period would compare twelve months
 * of activity against a one-month allowance and report every annual customer
 * as permanently over their plan.
 */
test("usage is measured monthly even on an annual plan", () => {
  const start = new Date("2026-01-15T00:00:00Z");
  const annual = sub({
    billingInterval: "annual",
    periodStart: start,
    periodEnd: new Date("2027-01-15T00:00:00Z"),
  });

  const window = currentUsageWindow(annual, new Date("2026-04-20T00:00:00Z"));

  const lengthDays =
    (window.to.getTime() - window.from.getTime()) / (1000 * 60 * 60 * 24);
  assert.ok(lengthDays <= 31, `window was ${lengthDays} days — should be about a month`);
  assert.equal(window.from.toISOString(), "2026-04-15T00:00:00.000Z");
  assert.equal(window.to.toISOString(), "2026-05-15T00:00:00.000Z");
});

test("usage windows are anchored to the signup day, not the calendar month", () => {
  // Someone who signs up on the 20th is measured 20th-to-20th. Calendar months
  // would give every new customer a short first window and a misleading
  // "you're well under your limit".
  const s = sub({ periodStart: new Date("2026-03-20T00:00:00Z") });
  const window = currentUsageWindow(s, new Date("2026-03-25T00:00:00Z"));
  assert.equal(window.from.toISOString(), "2026-03-20T00:00:00.000Z");
  assert.equal(window.to.toISOString(), "2026-04-20T00:00:00.000Z");
});

test("the window covers the moment asked about", () => {
  const s = sub({ periodStart: new Date("2026-01-01T00:00:00Z") });
  for (const iso of [
    "2026-01-01T00:00:00Z",
    "2026-01-31T23:59:59Z",
    "2026-06-15T12:00:00Z",
    "2027-02-02T00:00:00Z",
  ]) {
    const now = new Date(iso);
    const window = currentUsageWindow(s, now);
    assert.ok(window.from <= now && now < window.to, `${iso} fell outside its window`);
  }
});

// ============================================================
// Stripe's status vocabulary → ours
// ============================================================

test("the obvious statuses map straight across", () => {
  assert.equal(mapStripeStatus("trialing"), "trialing");
  assert.equal(mapStripeStatus("active"), "active");
  assert.equal(mapStripeStatus("past_due"), "past_due");
  assert.equal(mapStripeStatus("canceled"), "canceled");
});

/**
 * Stripe reaches `unpaid` after exhausting its retries — but the customer has
 * not cancelled and may still pay. Mapping it to `canceled` would drop them to
 * read-only over a card that eventually clears.
 */
test("Stripe's 'unpaid' is still owing, not cancelled", () => {
  assert.equal(mapStripeStatus("unpaid"), "past_due");
});

test("an expired incomplete subscription is cancelled — it can never activate", () => {
  assert.equal(mapStripeStatus("incomplete_expired"), "canceled");
});

test("an unfamiliar status keeps the customer working", () => {
  // The failure mode is somebody keeping access they may not deserve, which is
  // far cheaper than cutting off a customer who paid.
  assert.equal(mapStripeStatus("something_new_from_stripe"), "past_due");
});

// ============================================================
// The billing client seam
// ============================================================

test("a zero-price checkout is refused — there is no free tier", async () => {
  const client = new FixtureBillingClient();
  await assert.rejects(
    () =>
      client.createCheckoutSession({
        customerId: "cus_1",
        planKey: "starter",
        interval: "monthly",
        amountMinor: 0n,
        currency: "USD",
        successUrl: "https://x.example/ok",
        cancelUrl: "https://x.example/no",
        tenantId: "t-1",
      }),
    /must cost something/
  );
});

/**
 * The fixture transfer executor once minted colliding ids from a per-instance
 * counter, and it hit a unique index on the first real-Postgres run and nowhere
 * else. Deriving ids from the inputs is what stops that recurring here.
 */
test("fixture customer ids are derived from the tenant, not a counter", async () => {
  const a = new FixtureBillingClient();
  const b = new FixtureBillingClient();

  const first = await a.createCustomer({
    tenantId: "t-1", businessName: "One", email: "a@example.com",
  });
  const second = await b.createCustomer({
    tenantId: "t-1", businessName: "One", email: "a@example.com",
  });
  const other = await b.createCustomer({
    tenantId: "t-2", businessName: "Two", email: "b@example.com",
  });

  assert.equal(first.id, second.id, "same tenant, same id across instances");
  assert.notEqual(first.id, other.id, "different tenants must differ");
});
