/**
 * Email templates and the sender seam. No database.
 *
 * The send-once guarantee is proved in `e2e.ts` against real Postgres, because
 * it depends on a unique index and cannot be demonstrated here.
 *
 * What is proved here is what the messages actually SAY — the amounts, the
 * dates, and the two sentences whose absence would cause real harm.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  formatDateUtc,
  paidEmail,
  paymentFailedEmail,
  reviewWaitingEmail,
  trialEndingEmail,
} from "../email/templates";
import {
  FixtureEmailSender,
  UnconfiguredEmailSender,
} from "../email/sender";

const PORTAL = "https://app.example/portal/harbour";
const CONSOLE = "https://app.example/manage/harbour";

// ============================================================
// Dates
// ============================================================

test("dates are formatted in UTC, not the server's timezone", () => {
  // A payout stamped 02:00Z renders a day earlier under a US locale. An email
  // that disagrees with the portal by a day looks exactly like a discrepancy
  // worth disputing.
  assert.equal(formatDateUtc(new Date("2026-08-01T02:00:00Z")), "1 August 2026");
  assert.equal(formatDateUtc(new Date("2026-12-31T23:30:00Z")), "31 December 2026");
});

// ============================================================
// The paid email
// ============================================================

test("the amount matches how the screens format it, separators included", () => {
  const email = paidEmail({
    contributorName: "Alice",
    tenantName: "Harbour Press",
    amountMinor: 123450n,
    currency: "USD",
    paidOn: new Date("2026-08-01T00:00:00Z"),
    portalUrl: PORTAL,
  });

  assert.match(email.text, /\$1,234\.50/);
  assert.match(email.subject, /\$1,234\.50/);
});

/**
 * A contributor may work with several businesses. "You have been paid" from an
 * unfamiliar sender is indistinguishable from a phishing attempt.
 */
test("the paid email names the business, in the subject", () => {
  const email = paidEmail({
    contributorName: "Alice",
    tenantName: "Harbour Press",
    amountMinor: 5000n,
    currency: "USD",
    paidOn: new Date("2026-08-01T00:00:00Z"),
    portalUrl: PORTAL,
  });

  assert.match(email.subject, /Harbour Press/);
  assert.match(email.text, /Harbour Press/);
});

test("the paid email links to where the working-out lives", () => {
  const email = paidEmail({
    contributorName: "Alice",
    tenantName: "Harbour Press",
    amountMinor: 5000n,
    currency: "USD",
    paidOn: new Date("2026-08-01T00:00:00Z"),
    portalUrl: PORTAL,
  });

  assert.ok(email.text.includes(PORTAL));
});

test("a negative amount would be nonsense in a paid email, but still formats safely", () => {
  // Nothing should ever call it this way — `notifyPayoutsPaid` only reads
  // `paid` payouts — but a template that throws would take out a payout run.
  assert.doesNotThrow(() =>
    paidEmail({
      contributorName: "Alice",
      tenantName: "Harbour Press",
      amountMinor: -5000n,
      currency: "USD",
      paidOn: new Date(),
      portalUrl: PORTAL,
    })
  );
});

// ============================================================
// Trial and payment emails
// ============================================================

/**
 * ⚠️ THE SENTENCE THIS TEST PROTECTS IS THE POINT OF THE EMAIL.
 *
 * A trial ending does NOT delete anything — the account goes read-only. Saying
 * so is the difference between a customer who comes back and one who assumes
 * their records are gone.
 */
test("the trial email promises nothing is deleted", () => {
  const email = trialEndingEmail({
    ownerName: "Sam",
    tenantName: "Harbour Press",
    endsOn: new Date("2026-08-15T00:00:00Z"),
    daysLeft: 3,
    billingUrl: CONSOLE,
  });

  assert.match(email.text, /[Nn]othing is deleted/);
  assert.match(email.text, /15 August 2026/);
});

test("one day left reads as tomorrow, not '1 days'", () => {
  const email = trialEndingEmail({
    ownerName: "Sam",
    tenantName: "Harbour Press",
    endsOn: new Date("2026-08-15T00:00:00Z"),
    daysLeft: 1,
    billingUrl: CONSOLE,
  });

  assert.match(email.subject, /tomorrow/);
  assert.doesNotMatch(email.subject, /1 days/);
});

/**
 * ⚠️ EQUALLY LOAD-BEARING. A failed card does not suspend anything
 * (`entitlement` grants full access on `past_due`). If this email implies
 * otherwise, an owner panics that their artists have stopped being paid — and
 * the panic would be about something that is not happening.
 */
test("the payment-failed email says nothing has been switched off", () => {
  const email = paymentFailedEmail({
    ownerName: "Sam",
    tenantName: "Harbour Press",
    reason: "Your card was declined",
    billingUrl: CONSOLE,
  });

  assert.match(email.text, /[Nn]othing has been switched off/);
  assert.match(email.text, /still being paid/);
  assert.match(email.text, /declined/);
});

test("the payment-failed email works without a reason from the provider", () => {
  const email = paymentFailedEmail({
    ownerName: "Sam",
    tenantName: "Harbour Press",
    reason: null,
    billingUrl: CONSOLE,
  });

  assert.ok(email.text.length > 0);
  assert.doesNotMatch(email.text, /null/);
});

test("the review digest pluralises and totals correctly", () => {
  const one = reviewWaitingEmail({
    ownerName: "Sam", tenantName: "Harbour Press", itemCount: 1,
    totalMinor: 2200n, currency: "USD", consoleUrl: CONSOLE,
  });
  assert.match(one.subject, /1 sale needs/);

  const many = reviewWaitingEmail({
    ownerName: "Sam", tenantName: "Harbour Press", itemCount: 4,
    totalMinor: 880000n, currency: "USD", consoleUrl: CONSOLE,
  });
  assert.match(many.subject, /4 sales need/);
  assert.match(many.text, /\$8,800\.00/);
});

test("the review digest says nothing was guessed", () => {
  // The engine's refusal to invent a number is the reason these items exist.
  const email = reviewWaitingEmail({
    ownerName: "Sam", tenantName: "Harbour Press", itemCount: 2,
    totalMinor: 5000n, currency: "USD", consoleUrl: CONSOLE,
  });
  assert.match(email.text, /[Nn]othing was guessed/);
});

// ============================================================
// Every template
// ============================================================

test("every template produces plain text as well as HTML", () => {
  const emails = [
    paidEmail({
      contributorName: "A", tenantName: "T", amountMinor: 100n,
      currency: "USD", paidOn: new Date(), portalUrl: PORTAL,
    }),
    trialEndingEmail({
      ownerName: "S", tenantName: "T", endsOn: new Date(),
      daysLeft: 3, billingUrl: CONSOLE,
    }),
    paymentFailedEmail({
      ownerName: "S", tenantName: "T", reason: null, billingUrl: CONSOLE,
    }),
    reviewWaitingEmail({
      ownerName: "S", tenantName: "T", itemCount: 1,
      totalMinor: 100n, currency: "USD", consoleUrl: CONSOLE,
    }),
  ];

  for (const email of emails) {
    assert.ok(email.text.trim().length > 0, "text is what survives every client");
    assert.ok(email.html.trim().length > 0);
    assert.ok(email.subject.trim().length > 0);
  }
});

test("HTML escapes the values it interpolates", () => {
  const email = paidEmail({
    contributorName: '<script>alert(1)</script>',
    tenantName: "Harbour & Co",
    amountMinor: 100n,
    currency: "USD",
    paidOn: new Date(),
    portalUrl: PORTAL,
  });

  assert.doesNotMatch(email.html, /<script>/);
  assert.match(email.html, /&lt;script&gt;/);
  assert.match(email.html, /Harbour &amp; Co/);
});

// ============================================================
// The sender seam
// ============================================================

/**
 * ⚠️ The unconfigured sender must REPORT failure, not throw. Its callers have
 * usually just moved money; an exception here would turn a completed payout
 * into an error response.
 */
test("an unconfigured sender reports failure rather than throwing", async () => {
  const result = await new UnconfiguredEmailSender().send({
    to: "a@example.com", subject: "x", text: "y",
  });

  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /not configured/);
});

test("the fixture records what it sent", async () => {
  const sender = new FixtureEmailSender();
  await sender.send({ to: "a@example.com", subject: "Hello", text: "Body" });

  assert.equal(sender.sent.length, 1);
  assert.equal(sender.lastTo("a@example.com")?.subject, "Hello");
});

test("the fixture can be made to fail, so callers can be tested against it", async () => {
  const sender = new FixtureEmailSender();
  sender.failNext = 1;

  const failed = await sender.send({ to: "a@example.com", subject: "x", text: "y" });
  assert.equal(failed.ok, false);

  const succeeded = await sender.send({ to: "a@example.com", subject: "x", text: "y" });
  assert.equal(succeeded.ok, true);
});
