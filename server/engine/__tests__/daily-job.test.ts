/**
 * The daily job's decisions. No database.
 *
 * What is proved here is *when* the sweep decides something is due. That the
 * message then goes out at most once is a property of the unique index behind
 * `sendOnce` and is proved in `e2e.ts` against real Postgres, along with the
 * sweep itself.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  TRIAL_WARNING_DAYS,
  daysUntil,
  shouldDigestReview,
  shouldWarnAboutTrial,
} from "../jobs/daily";
import { isEmailConfigured, resetEmailSender, setEmailSender } from "../email/sender";
import { FixtureEmailSender } from "../email/sender";

const NOW = new Date("2026-08-02T09:00:00Z");

function trialing(endsAt: string) {
  return { status: "trialing", trialEndsAt: new Date(endsAt) };
}

// ============================================================
// The trial threshold
// ============================================================

/**
 * The defect this prevents is silent and unrecoverable, so it is worth stating
 * plainly: the dedupe key for the trial warning is the trial's END DATE, so
 * exactly one warning is ever sent per trial. If a daily sweep sent it on day
 * one, that single warning would say "your trial ends in 14 days" — and the
 * customer would then hear nothing in the final week, when it matters.
 */
test("a trial that has just started is not warned about", () => {
  assert.equal(shouldWarnAboutTrial(trialing("2026-08-16T00:00:00Z"), NOW), false);
});

/**
 * The threshold is the final 72 hours, because the day count rounds UP — the
 * same way the email's "3 days left" rounds up. A trial ending in three days
 * and three hours genuinely has four days left to say out loud, so it waits.
 * The boundary is stated here rather than left to be re-derived.
 */
test("the warning goes out inside the threshold, not before it", () => {
  // Three days and three hours out: the email would have to say "4 days", so no.
  assert.equal(shouldWarnAboutTrial(trialing("2026-08-05T12:00:00Z"), NOW), false);
  // Exactly three days out: due.
  assert.equal(shouldWarnAboutTrial(trialing("2026-08-05T09:00:00Z"), NOW), true);
  assert.equal(shouldWarnAboutTrial(trialing("2026-08-03T12:00:00Z"), NOW), true);
});

test("a trial ending within hours is still warned about", () => {
  assert.equal(shouldWarnAboutTrial(trialing("2026-08-02T18:00:00Z"), NOW), true);
});

test("a trial that already ended is not warned about", () => {
  assert.equal(shouldWarnAboutTrial(trialing("2026-08-01T09:00:00Z"), NOW), false);
});

test("only a trialing subscription is warned about", () => {
  // Somebody who already paid must never receive "your trial is ending".
  for (const status of ["active", "past_due", "canceled"]) {
    assert.equal(
      shouldWarnAboutTrial({ status, trialEndsAt: new Date("2026-08-03T12:00:00Z") }, NOW),
      false,
      `${status} should not be warned`
    );
  }
});

test("a trialing subscription with no end date is not warned about", () => {
  assert.equal(shouldWarnAboutTrial({ status: "trialing", trialEndsAt: null }, NOW), false);
});

/**
 * The job decides a warning is due; the email prints how many days are left.
 * If the two rounded differently, a warning could go out on the boundary whose
 * subject line said a different number from the one the job tested.
 */
test("the day count matches the arithmetic the email uses", () => {
  assert.equal(daysUntil(new Date("2026-08-05T09:00:00Z"), NOW), 3);
  // Part of a day rounds up, the same way the template does.
  assert.equal(daysUntil(new Date("2026-08-05T09:00:01Z"), NOW), 4);
  assert.equal(daysUntil(new Date("2026-08-02T23:59:00Z"), NOW), 1);
  assert.equal(TRIAL_WARNING_DAYS, 3);
});

// ============================================================
// Who gets nagged about stuck sales
// ============================================================

test("a cancelled business is not nagged about stuck sales", () => {
  assert.equal(shouldDigestReview({ status: "canceled" }), false);
});

/**
 * ⚠️ Both of these would break under the tempting rule "only nag people who
 * can currently write". A lapsed trial is read-only, and a hand-provisioned
 * tenant has no subscription row at all — 369 will be exactly that as tenant
 * #1. Muting either is a silent loss of the notice that shows the product
 * working.
 */
test("a business with no subscription row is still nagged", () => {
  assert.equal(shouldDigestReview(null), true);
});

test("a lapsed trial and a failed card are still nagged", () => {
  assert.equal(shouldDigestReview({ status: "trialing" }), true);
  assert.equal(shouldDigestReview({ status: "past_due" }), true);
  assert.equal(shouldDigestReview({ status: "active" }), true);
});

// ============================================================
// The refusal that protects the dedupe keys
// ============================================================

/**
 * `sendOnce` claims its dedupe row BEFORE calling the provider and leaves it
 * claimed when the send fails. A sweep across every tenant through an
 * unconfigured sender would therefore burn every trial-warning key, and adding
 * a real key later would not repair it — the system would correctly believe
 * those customers had already been told. So the sweep refuses to start.
 */
test("email is reported unconfigured without a key and a from address", () => {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  try {
    resetEmailSender();
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    assert.equal(isEmailConfigured(), false);

    process.env.RESEND_API_KEY = "re_test";
    assert.equal(isEmailConfigured(), false, "a key without a from address is not enough");

    process.env.EMAIL_FROM = "hello@example.com";
    assert.equal(isEmailConfigured(), true);
  } finally {
    resetEmailSender();
    if (key === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = key;
    if (from === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = from;
  }
});

test("an injected sender counts as configured, so tests can sweep", () => {
  try {
    setEmailSender(new FixtureEmailSender());
    assert.equal(isEmailConfigured(), true);
  } finally {
    resetEmailSender();
  }
});
