/**
 * What the emails say. Pure — no database, no clock, no network.
 *
 * ────────────────────────────────────────────────────────────────────────
 * THREE RULES, ALL INHERITED FROM SCREENS THAT ALREADY GOT THIS WRONG
 * ────────────────────────────────────────────────────────────────────────
 *
 * 1. **Amounts use `formatMoney`, the same function the screens use.** An email
 *    saying $1,234.50 next to a statement saying $1234.5 reads as two different
 *    numbers to somebody checking whether they were paid correctly. The client
 *    formatter deliberately mirrors the server's for exactly this reason.
 *
 * 2. **Dates are formatted from the ISO string in UTC**, never through a
 *    locale. A payout stamped 02:00Z otherwise renders a day earlier in
 *    California, and an email that disagrees with the portal by a day looks
 *    precisely like a discrepancy worth disputing.
 *
 * 3. **Plain text is always present; HTML is a bonus.** Text is what survives
 *    every client, every forwarding chain, and every screen reader. Writing the
 *    text version first also keeps the wording honest — anything that only
 *    works with bold and colour is usually saying too little.
 *
 * A fourth, about tone: these are messages about somebody's money. They state
 * the number, where it came from, and where to look. No exclamation marks, no
 * "great news", nothing that would read badly next to a chargeback.
 */

import { formatMoney } from "../money";

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/** UTC, from the date's own components. Never `toLocaleDateString`. */
export function formatDateUtc(date: Date): string {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Minimal wrapper. No images, no external CSS — both get stripped or blocked. */
function wrap(bodyLines: string[]): string {
  const paragraphs = bodyLines
    .filter((line) => line.trim().length > 0)
    .map((line) => `<p style="margin:0 0 12px">${escapeHtml(line)}</p>`)
    .join("\n");

  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.5;color:#111">
${paragraphs}
</div>`;
}

function render(subject: string, lines: string[]): RenderedEmail {
  return {
    subject,
    text: lines.join("\n\n").trim(),
    html: wrap(lines),
  };
}

/**
 * A contributor has been paid.
 *
 * Names the business, because a contributor may work with several and "you have
 * been paid" from an unfamiliar sender is indistinguishable from a phishing
 * attempt. Says where the money went in the vaguest safe terms — never account
 * details, which we do not hold and would not put in an email if we did.
 */
export function paidEmail(input: {
  contributorName: string;
  tenantName: string;
  amountMinor: bigint;
  currency: string;
  paidOn: Date;
  portalUrl: string;
}): RenderedEmail {
  const amount = formatMoney(input.amountMinor, input.currency);

  return render(`${input.tenantName} has sent you ${amount}`, [
    `Hello ${input.contributorName},`,
    `${input.tenantName} has sent you ${amount} on ${formatDateUtc(input.paidOn)}.`,
    "It should reach your bank account in a few working days, depending on your bank.",
    `You can see how this was worked out — every sale, and what was deducted before your share — here: ${input.portalUrl}`,
    "If anything looks wrong, reply to this email and ask. Every number has a full breakdown behind it.",
  ]);
}

/**
 * A trial is about to end.
 *
 * States what happens next precisely, because the honest answer is reassuring
 * and vagueness here reads as a threat. Nothing is deleted; they lose the
 * ability to run payouts, not their records.
 */
export function trialEndingEmail(input: {
  ownerName: string;
  tenantName: string;
  endsOn: Date;
  daysLeft: number;
  billingUrl: string;
}): RenderedEmail {
  const days =
    input.daysLeft === 1 ? "tomorrow" : `in ${input.daysLeft} days`;

  return render(`Your ${input.tenantName} trial ends ${days}`, [
    `Hello ${input.ownerName},`,
    `Your free trial ends on ${formatDateUtc(input.endsOn)}.`,
    "Nothing is deleted when it does. Everything you have set up — your people, your rates, your history — stays exactly where it is, and you can still sign in and look at all of it.",
    "What stops is sending payments. To keep paying people, choose a plan here:",
    input.billingUrl,
    "If you are not ready, you can pick one up later and carry on where you left off.",
  ]);
}

/**
 * A subscription payment failed.
 *
 * ⚠️ THE MOST IMPORTANT LINE IN THIS FILE IS THE REASSURANCE. A failed card
 * does not suspend anything (see `entitlement`), and saying so plainly is the
 * difference between a customer updating their card this week and a customer
 * panicking that their artists have stopped being paid. Do not "tighten" this
 * copy into a threat — the product genuinely keeps working, and the email
 * should say what is true.
 */
export function paymentFailedEmail(input: {
  ownerName: string;
  tenantName: string;
  reason: string | null;
  billingUrl: string;
}): RenderedEmail {
  return render(`We could not take your payment for ${input.tenantName}`, [
    `Hello ${input.ownerName},`,
    input.reason
      ? `Your last subscription payment did not go through: ${input.reason}`
      : "Your last subscription payment did not go through.",
    "Nothing has been switched off. Your people are still being paid and everything works as normal — we will simply try the card again.",
    `You can update your card here: ${input.billingUrl}`,
  ]);
}

/**
 * Sales are sitting unpaid because something needs a decision.
 *
 * Sent as a digest rather than per item. One email per stuck sale would arrive
 * fifty at a time after a bad import and get filtered, which is the opposite of
 * the intent — the items that need attention are exactly the ones somebody must
 * actually see.
 */
export function reviewWaitingEmail(input: {
  ownerName: string;
  tenantName: string;
  itemCount: number;
  totalMinor: bigint;
  currency: string;
  consoleUrl: string;
}): RenderedEmail {
  const noun = input.itemCount === 1 ? "sale" : "sales";

  return render(
    `${input.itemCount} ${noun} need${input.itemCount === 1 ? "s" : ""} your attention`,
    [
      `Hello ${input.ownerName},`,
      `${input.itemCount} ${noun} at ${input.tenantName}, worth ${formatMoney(input.totalMinor, input.currency)}, could not be paid out automatically.`,
      "This is usually because a sale could not be matched to anyone, or a payment fee could not be read. Nothing was guessed — the money is recorded and waiting for you to say what should happen.",
      `Have a look here: ${input.consoleUrl}`,
    ]
  );
}

/** Told to the platform owner when a business signs up. Not customer-facing. */
export function newSignupEmail(input: {
  businessName: string;
  ownerEmail: string;
  planKey: string;
  consoleUrl: string;
}): RenderedEmail {
  return render(`New sign-up: ${input.businessName}`, [
    `${input.businessName} just started a trial.`,
    `Contact: ${input.ownerEmail}`,
    `Plan chosen: ${input.planKey}`,
    input.consoleUrl,
  ]);
}
