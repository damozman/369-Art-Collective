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
  DEFAULT_PLAN_KEY,
  PLANS,
  findPlan,
  selectablePlans,
  smallestPlanFor,
} from "../billing/plans";
import { entitlement, addDays } from "../billing/subscription";
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
  assert.equal(result.active, true);
  assert.equal(result.message, null);
  assert.equal(result.needsPaymentMethod, false);
});

test("a running trial works", () => {
  const now = new Date("2026-08-01T00:00:00Z");
  const result = entitlement(
    sub({ status: "trialing", trialEndsAt: addDays(now, 5) }),
    now
  );
  assert.equal(result.active, true);
});

test("an expired trial stops", () => {
  const now = new Date("2026-08-20T00:00:00Z");
  const result = entitlement(
    sub({ status: "trialing", trialEndsAt: new Date("2026-08-15T00:00:00Z") }),
    now
  );
  assert.equal(result.active, false);
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
  assert.equal(result.active, true);
  assert.ok(result.message, "but they are told");
  assert.equal(result.needsPaymentMethod, true);
});

test("a cancelled subscription stops", () => {
  assert.equal(entitlement(sub({ status: "canceled" })).active, false);
});

test("no subscription at all stops", () => {
  assert.equal(entitlement(null).active, false);
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
