/**
 * The actual notifications: who gets told what, and when.
 *
 * ⚠️ DELIBERATELY NOT CALLED FROM `payout.ts`. The payout engine knows about
 * money and nothing else; wiring email into it would mean a mail failure lives
 * inside the same call stack as a transfer, and the next person refactoring
 * would have to keep re-deriving why it must not throw. Callers invoke these
 * AFTER the work has completed and committed, and every function here swallows
 * its own failures.
 *
 * Every dedupe key is built from a stable id — a payout id, a subscription
 * period — never from a timestamp. `payout_paid:<payoutId>` collides on replay,
 * which is the whole point; `payout_paid:<Date.now()>` would not, and would
 * happily tell somebody four times that they had been paid.
 */

import { and, eq } from "drizzle-orm";

import * as schema from "@shared/engine-schema";
import type { EngineDb } from "../ingest";
import { sendOnce, type NotifyResult } from "./notify";
import {
  newSignupEmail,
  paidEmail,
  paymentFailedEmail,
  reviewWaitingEmail,
  trialEndingEmail,
} from "./templates";
import type { EmailSender } from "./types";

export interface NotifyOptions {
  sender: EmailSender;
  /** e.g. https://app.example.com — no trailing slash. */
  baseUrl: string;
}

/**
 * Tell everyone paid in a batch.
 *
 * Reads the batch back from the database rather than taking the run's return
 * value, so it reports what was actually recorded. A caller that passed in its
 * own idea of who was paid could drift from the ledger; the ledger is the
 * record people will check against.
 */
export async function notifyPayoutsPaid(
  db: EngineDb,
  options: NotifyOptions & { tenantId: string; batchId: string }
): Promise<{ sent: number; skipped: number; failed: number }> {
  const summary = { sent: 0, skipped: 0, failed: 0 };

  try {
    const [tenant] = await db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, options.tenantId))
      .limit(1);

    if (!tenant) return summary;

    const rows = await db
      .select({
        payout: schema.payouts,
        contributorName: schema.contributors.name,
        contributorEmail: schema.contributors.email,
      })
      .from(schema.payouts)
      .innerJoin(
        schema.contributors,
        eq(schema.payouts.contributorId, schema.contributors.id)
      )
      .where(
        and(
          eq(schema.payouts.batchId, options.batchId),
          eq(schema.payouts.tenantId, options.tenantId),
          // Only people whose money actually moved. Telling somebody about a
          // failed payout would be worse than saying nothing.
          eq(schema.payouts.status, "paid")
        )
      );

    for (const row of rows) {
      const email = paidEmail({
        contributorName: row.contributorName,
        tenantName: tenant.name,
        amountMinor: BigInt(row.payout.amountMinor),
        currency: row.payout.currency,
        paidOn: row.payout.completedAt ?? new Date(),
        portalUrl: `${options.baseUrl}/portal/${tenant.slug}`,
      });

      const result = await sendOnce(db, {
        tenantId: options.tenantId,
        type: "payout_paid",
        dedupeKey: `payout_paid:${row.payout.id}`,
        to: row.contributorEmail,
        email,
        sender: options.sender,
      });

      tally(summary, result);
    }
  } catch {
    // Never propagates. The payouts already happened.
  }

  return summary;
}

/** Tell the owner their trial is nearly up. */
export async function notifyTrialEnding(
  db: EngineDb,
  options: NotifyOptions & { tenantId: string; now?: Date }
): Promise<NotifyResult> {
  try {
    const now = options.now ?? new Date();

    const [row] = await db
      .select({
        subscription: schema.subscriptions,
        tenant: schema.tenants,
      })
      .from(schema.subscriptions)
      .innerJoin(schema.tenants, eq(schema.subscriptions.tenantId, schema.tenants.id))
      .where(eq(schema.subscriptions.tenantId, options.tenantId))
      .limit(1);

    if (!row?.subscription.trialEndsAt) return { status: "no_recipient" };
    if (row.subscription.status !== "trialing") return { status: "no_recipient" };

    const owner = await firstOwner(db, options.tenantId);
    if (!owner) return { status: "no_recipient" };

    const msLeft = row.subscription.trialEndsAt.getTime() - now.getTime();
    const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return { status: "no_recipient" };

    const email = trialEndingEmail({
      ownerName: owner.name,
      tenantName: row.tenant.name,
      endsOn: row.subscription.trialEndsAt,
      daysLeft: Math.max(daysLeft, 1),
      billingUrl: `${options.baseUrl}/manage/${row.tenant.slug}`,
    });

    return await sendOnce(db, {
      tenantId: options.tenantId,
      // Keyed on the trial end date, so moving the date allows a fresh warning
      // but a repeated job on the same trial does not.
      dedupeKey: `trial_ending:${row.subscription.trialEndsAt.toISOString()}`,
      type: "trial_ending",
      to: owner.email,
      email,
      sender: options.sender,
    });
  } catch (error) {
    return { status: "failed", error: (error as Error).message };
  }
}

/** Tell the owner a subscription payment failed — and that nothing stopped. */
export async function notifyPaymentFailed(
  db: EngineDb,
  options: NotifyOptions & { tenantId: string; reason: string | null }
): Promise<NotifyResult> {
  try {
    const [row] = await db
      .select({ subscription: schema.subscriptions, tenant: schema.tenants })
      .from(schema.subscriptions)
      .innerJoin(schema.tenants, eq(schema.subscriptions.tenantId, schema.tenants.id))
      .where(eq(schema.subscriptions.tenantId, options.tenantId))
      .limit(1);

    if (!row) return { status: "no_recipient" };

    const owner = await firstOwner(db, options.tenantId);
    if (!owner) return { status: "no_recipient" };

    const email = paymentFailedEmail({
      ownerName: owner.name,
      tenantName: row.tenant.name,
      reason: options.reason,
      billingUrl: `${options.baseUrl}/manage/${row.tenant.slug}`,
    });

    return await sendOnce(db, {
      tenantId: options.tenantId,
      type: "payment_failed",
      // Keyed on the billing period so a customer whose card fails again next
      // month is told again, but Stripe's several retries within one period
      // produce one email rather than four.
      dedupeKey: `payment_failed:${row.subscription.periodEnd.toISOString()}`,
      to: owner.email,
      email,
      sender: options.sender,
    });
  } catch (error) {
    return { status: "failed", error: (error as Error).message };
  }
}

/**
 * Tell the owner that sales are stuck.
 *
 * Keyed by day: one digest per tenant per day however often this runs. Per-item
 * emails would arrive fifty at a time after a bad import and be filtered, which
 * defeats the purpose — these are the items somebody must actually see.
 */
export async function notifyReviewWaiting(
  db: EngineDb,
  options: NotifyOptions & { tenantId: string; now?: Date }
): Promise<NotifyResult> {
  try {
    const now = options.now ?? new Date();

    const [tenant] = await db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, options.tenantId))
      .limit(1);

    if (!tenant) return { status: "no_recipient" };

    const stuck = await db
      .select({
        grossAmountMinor: schema.revenueEvents.grossAmountMinor,
      })
      .from(schema.revenueEvents)
      .where(
        and(
          eq(schema.revenueEvents.tenantId, options.tenantId),
          eq(schema.revenueEvents.needsReview, true)
        )
      );

    if (stuck.length === 0) return { status: "no_recipient" };

    const owner = await firstOwner(db, options.tenantId);
    if (!owner) return { status: "no_recipient" };

    const total = stuck.reduce((sum, row) => sum + BigInt(row.grossAmountMinor), 0n);

    const email = reviewWaitingEmail({
      ownerName: owner.name,
      tenantName: tenant.name,
      itemCount: stuck.length,
      totalMinor: total,
      currency: tenant.defaultCurrency,
      consoleUrl: `${options.baseUrl}/manage/${tenant.slug}`,
    });

    return await sendOnce(db, {
      tenantId: options.tenantId,
      type: "review_waiting",
      dedupeKey: `review_waiting:${now.toISOString().slice(0, 10)}`,
      to: owner.email,
      email,
      sender: options.sender,
    });
  } catch (error) {
    return { status: "failed", error: (error as Error).message };
  }
}

/**
 * Tell the platform owner somebody signed up.
 *
 * Goes to `PLATFORM_NOTIFY_EMAIL`, not to the customer. This is what replaces
 * gating signup behind approval — the conversations are the point, and they are
 * available without making a new customer wait.
 */
export async function notifyNewSignup(
  db: EngineDb,
  options: NotifyOptions & {
    tenantId: string;
    businessName: string;
    ownerEmail: string;
    planKey: string;
    tenantSlug: string;
  }
): Promise<NotifyResult> {
  try {
    const to = process.env.PLATFORM_NOTIFY_EMAIL;
    if (!to) return { status: "no_recipient" };

    const email = newSignupEmail({
      businessName: options.businessName,
      ownerEmail: options.ownerEmail,
      planKey: options.planKey,
      consoleUrl: `${options.baseUrl}/manage/${options.tenantSlug}`,
    });

    return await sendOnce(db, {
      tenantId: options.tenantId,
      type: "new_signup",
      dedupeKey: `new_signup:${options.tenantId}`,
      to,
      email,
      sender: options.sender,
      // So a reply goes to the customer rather than into the void.
      replyTo: options.ownerEmail,
    });
  } catch (error) {
    return { status: "failed", error: (error as Error).message };
  }
}

async function firstOwner(
  db: EngineDb,
  tenantId: string
): Promise<{ name: string; email: string } | null> {
  const [owner] = await db
    .select({ name: schema.tenantUsers.name, email: schema.tenantUsers.email })
    .from(schema.tenantUsers)
    .where(
      and(
        eq(schema.tenantUsers.tenantId, tenantId),
        eq(schema.tenantUsers.role, "admin")
      )
    )
    .orderBy(schema.tenantUsers.createdAt)
    .limit(1);

  return owner ?? null;
}

function tally(
  summary: { sent: number; skipped: number; failed: number },
  result: NotifyResult
): void {
  if (result.status === "sent") summary.sent++;
  else if (result.status === "failed") summary.failed++;
  else summary.skipped++;
}
