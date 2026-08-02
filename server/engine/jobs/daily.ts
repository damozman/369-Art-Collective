/**
 * The daily job — the timer behind the two emails nobody triggers by hand.
 *
 * Every other notification in `email/notifications.ts` fires from a request
 * path: somebody runs a payout, somebody signs up, Stripe reports a failed
 * card. Two of them have no such moment. "Your trial ends in three days" and
 * "four sales are stuck waiting for you" are true because time passed, and
 * nothing in an HTTP handler notices time passing. This file is what notices.
 *
 * ────────────────────────────────────────────────────────────────────────
 * WHY THIS IS SAFE TO RUN OFTEN, AND WHY THAT MATTERS
 * ────────────────────────────────────────────────────────────────────────
 *
 * A scheduler that must fire *exactly* once a day needs to survive restarts,
 * deploys, clock changes and a process that happened to be down at 03:00. That
 * is a stateful problem, and the usual solutions (a lock table, a last-run
 * timestamp) are a second source of truth that can disagree with the thing it
 * guards.
 *
 * We do not need any of it, because `sendOnce` already guarantees at-most-once
 * per tenant per dedupe key, enforced by a unique index in the database. The
 * trial warning is keyed on the trial's end date and the review digest on the
 * calendar day, so calling this function twenty times in an hour sends exactly
 * what calling it once sends. The scheduler is therefore allowed to be dumb and
 * to re-run on every restart — see `scheduler.ts`.
 *
 * ⚠️ That idempotence is load-bearing, not incidental. Anything added here must
 * be safe to run repeatedly, which in practice means it must go through
 * `sendOnce` with a key derived from stable facts. A key containing the current
 * time would turn an hourly tick into hourly email.
 *
 * ⚠️ AND THE INVERSE TRAP, which is the reason `scheduler.ts` refuses to start
 * without a configured sender: `sendOnce` claims its dedupe row BEFORE calling
 * the provider, and leaves the row in place when the send fails. Sweeping a
 * deployment that has no email provider would therefore burn every trial
 * warning key against `UnconfiguredEmailSender` — and when a real key was added
 * later, those customers would never be warned, because the system would
 * correctly believe it had already told them.
 *
 * Nothing here throws. A job that crashes the process it runs inside is worse
 * than a job that skips a day.
 */

import { eq } from "drizzle-orm";

import * as schema from "@shared/engine-schema";
import { notifyReviewWaiting, notifyTrialEnding } from "../email/notifications";
import type { NotifyResult } from "../email/notify";
import type { EmailSender } from "../email/types";
import type { EngineDb } from "../ingest";

/**
 * How close to the end of a trial the warning goes out.
 *
 * ⚠️ THIS THRESHOLD LIVES HERE, NOT IN `notifyTrialEnding`. That function sends
 * whenever it is asked and a trial is running — it is the messenger, and it has
 * no opinion about when the message is due. Without a threshold on this side, a
 * daily sweep would send "your trial ends in 14 days" on the customer's first
 * morning, burn the dedupe key (which is the trial's end date), and then say
 * nothing at all in the week that actually matters.
 */
export const TRIAL_WARNING_DAYS = 3;

export interface Tally {
  sent: number;
  skipped: number;
  failed: number;
}

export interface DailyJobSummary {
  tenantsSwept: number;
  trialWarnings: Tally;
  reviewDigests: Tally;
  /** Tenants the sweep could not finish. Recorded, never raised. */
  errors: { tenantId: string; error: string }[];
}

export interface DailyJobOptions {
  sender: EmailSender;
  /** e.g. https://app.example.com — no trailing slash. */
  baseUrl: string;
  now?: Date;
}

/**
 * Whole days between now and `when`, rounded the same way `notifyTrialEnding`
 * rounds it.
 *
 * Deliberately duplicated arithmetic rather than a shared helper import: if the
 * two ever disagree, this side decides a warning is due while the other side
 * prints a different number of days in the subject line. Matching them is the
 * point, so the formula is written out where it can be compared by eye and is
 * pinned by a test.
 */
export function daysUntil(when: Date, now: Date): number {
  return Math.ceil((when.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Is this subscription close enough to the end of its trial to warn about?
 *
 * Pure, so the decision can be tested without a database or a clock.
 */
export function shouldWarnAboutTrial(
  subscription: { status: string; trialEndsAt: Date | null },
  now: Date
): boolean {
  if (subscription.status !== "trialing") return false;
  if (!subscription.trialEndsAt) return false;

  const daysLeft = daysUntil(subscription.trialEndsAt, now);

  // Already over. `notifyTrialEnding` would decline anyway; declining here too
  // keeps the reason visible on this side.
  if (daysLeft < 0) return false;

  return daysLeft <= TRIAL_WARNING_DAYS;
}

/**
 * Should this tenant be told about sales waiting for them?
 *
 * ⚠️ ONLY AN EXPLICIT CANCELLATION SILENCES THIS, and the narrowness is
 * deliberate. The obvious-looking rule — "only nag people who can currently
 * write" — would silence two groups who should be nagged. A tenant whose trial
 * lapsed is read-only but is exactly the person a "four sales are stuck" notice
 * should reach; that is the value of the product, arriving at the moment they
 * are deciding whether to pay for it. And a tenant with no subscription row at
 * all is not a delinquent — the engine predates billing, and 369 itself will be
 * provisioned by hand as tenant #1 rather than through self-serve signup.
 * Gating on billing state would quietly mute the first real customer.
 */
export function shouldDigestReview(
  subscription: { status: string } | null
): boolean {
  return subscription?.status !== "canceled";
}

/**
 * Sweep every tenant and send whatever is due.
 *
 * Errors are collected per tenant rather than aborting the sweep: one tenant
 * with a malformed row must not stop the other ninety-nine being told their
 * trial is ending.
 */
export async function runDailyJobs(
  db: EngineDb,
  options: DailyJobOptions
): Promise<DailyJobSummary> {
  const now = options.now ?? new Date();

  const summary: DailyJobSummary = {
    tenantsSwept: 0,
    trialWarnings: { sent: 0, skipped: 0, failed: 0 },
    reviewDigests: { sent: 0, skipped: 0, failed: 0 },
    errors: [],
  };

  let rows: {
    tenantId: string;
    status: string | null;
    trialEndsAt: Date | null;
  }[];

  try {
    rows = await db
      .select({
        tenantId: schema.tenants.id,
        status: schema.subscriptions.status,
        trialEndsAt: schema.subscriptions.trialEndsAt,
      })
      .from(schema.tenants)
      // LEFT, not INNER. A tenant without a subscription row still has stuck
      // sales worth reporting — see `shouldDigestReview`.
      .leftJoin(
        schema.subscriptions,
        eq(schema.subscriptions.tenantId, schema.tenants.id)
      );
  } catch (error) {
    summary.errors.push({ tenantId: "*", error: (error as Error).message });
    return summary;
  }

  for (const row of rows) {
    summary.tenantsSwept++;

    const subscription = row.status
      ? { status: row.status, trialEndsAt: row.trialEndsAt }
      : null;

    try {
      if (subscription && shouldWarnAboutTrial(subscription, now)) {
        tally(
          summary.trialWarnings,
          await notifyTrialEnding(db, {
            sender: options.sender,
            baseUrl: options.baseUrl,
            tenantId: row.tenantId,
            now,
          })
        );
      }

      if (shouldDigestReview(subscription)) {
        tally(
          summary.reviewDigests,
          await notifyReviewWaiting(db, {
            sender: options.sender,
            baseUrl: options.baseUrl,
            tenantId: row.tenantId,
            now,
          })
        );
      }
    } catch (error) {
      // The notifiers already swallow their own failures; this is belt and
      // braces so one unexpected throw cannot end the sweep.
      summary.errors.push({
        tenantId: row.tenantId,
        error: (error as Error).message,
      });
    }
  }

  return summary;
}

function tally(into: Tally, result: NotifyResult): void {
  if (result.status === "sent") into.sent++;
  else if (result.status === "failed") into.failed++;
  else into.skipped++;
}
