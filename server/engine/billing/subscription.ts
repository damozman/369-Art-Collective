/**
 * A tenant's standing with us: what plan they are on, whether they are paying,
 * and how much of the plan they are using.
 *
 * ────────────────────────────────────────────────────────────────────────
 * THE TWO RULES THAT GOVERN EVERY FUNCTION IN THIS FILE
 * ────────────────────────────────────────────────────────────────────────
 *
 * Both are blueprint §12, both were argued with the user, and both are easy to
 * break with a well-meaning refactor:
 *
 * 1. **The plan is chosen, never metered.** `recordUsageOverage` writes a
 *    NOTICE. It does not write `planKey`. Nothing in this file raises a bill.
 *    Moving someone to a bigger plan is an action the customer takes, or one
 *    taken at renewal after the notice already exists.
 *
 * 2. **Nothing here blocks anything.** There is deliberately no
 *    `canPayContributor()` or `assertUnderLimit()`. Read `entitlement()` for
 *    what an unpaid subscription actually restricts, and note what it does not.
 *
 * ────────────────────────────────────────────────────────────────────────
 * WHAT COUNTS AS "A PERSON PAID"
 * ────────────────────────────────────────────────────────────────────────
 *
 * Distinct contributors with a payout in the period that reached `paid`.
 * Deliberately not:
 *
 *   - contributors on the books (§12 rule 1 — a quiet month should cost less)
 *   - payouts that FAILED, because charging for an attempt that did not arrive
 *     is indefensible and would be noticed
 *   - one person paid three times counting as three
 */

import { and, eq, gte, lt, sql } from "drizzle-orm";

import * as schema from "@shared/engine-schema";
import type { EngineDb } from "../ingest";
import {
  DEFAULT_PLAN_KEY,
  TRIAL_DAYS,
  findPlan,
  smallestPlanFor,
  type BillingInterval,
  type Plan,
} from "./plans";

export class SubscriptionError extends Error {}

/** Adds whole days in UTC — same approach as the ledger's hold dates. */
export function addDays(from: Date, days: number): Date {
  const next = new Date(from);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * Add whole months, clamping to the end of a short month.
 *
 * A subscription starting 31 January has no 31 February. Rolling over to 3
 * March instead of clamping to 28 February would drift the anniversary forward
 * every year and silently shorten one usage window.
 */
export function addMonths(from: Date, months: number): Date {
  const day = from.getUTCDate();
  const next = new Date(from);
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);

  const lastDayOfTarget = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)
  ).getUTCDate();

  next.setUTCDate(Math.min(day, lastDayOfTarget));
  return next;
}

/**
 * The monthly window a plan's people-limit is measured over.
 *
 * ⚠️ THIS IS NOT THE BILLING PERIOD, and conflating them is the specific bug
 * annual billing introduces. `peopleLimit` is per month (see `plans.ts`). An
 * annual subscription's `periodEnd` is a year out, so counting people paid
 * across it would compare twelve months of activity against a one-month
 * allowance and report every annual customer as permanently over.
 *
 * Windows are anchored to the subscription's start day rather than the calendar
 * month, so someone who signs up on the 20th is measured 20th-to-20th. Calendar
 * months would give every new customer a short first window and a spurious
 * "you're well under your limit" in their first month.
 */
export function currentUsageWindow(
  subscription: schema.Subscription,
  now = new Date()
): { from: Date; to: Date } {
  const anchor = subscription.periodStart;

  if (now <= anchor) {
    return { from: anchor, to: addMonths(anchor, 1) };
  }

  // Step forward a month at a time from the anchor. Bounded by the longest
  // plausible subscription rather than looping on a clock we do not control.
  let from = anchor;
  for (let i = 0; i < 600; i++) {
    const to = addMonths(anchor, i + 1);
    if (now < to) {
      from = addMonths(anchor, i);
      return { from, to };
    }
  }

  return { from, to: addMonths(from, 1) };
}

/**
 * Start a tenant on a trial.
 *
 * No card required. A trial that asks for payment details up front is a
 * different product decision than the one taken (§12: 14-day trial, no free
 * tier), and it collapses signup conversion.
 */
export async function startTrial(
  db: EngineDb,
  tenantId: string,
  options: { planKey?: string; now?: Date } = {}
): Promise<schema.Subscription> {
  const now = options.now ?? new Date();
  const planKey = options.planKey ?? DEFAULT_PLAN_KEY;

  if (!findPlan(planKey)) {
    throw new SubscriptionError("That plan does not exist");
  }

  const trialEnd = addDays(now, TRIAL_DAYS);

  const [row] = await db
    .insert(schema.subscriptions)
    .values({
      tenantId,
      planKey,
      status: "trialing",
      periodStart: now,
      // The first billing period ends when the trial does, so the first invoice
      // lands the day the trial expires rather than a month later.
      periodEnd: trialEnd,
      trialEndsAt: trialEnd,
    })
    .returning();

  return row;
}

export async function getSubscription(
  db: EngineDb,
  tenantId: string
): Promise<schema.Subscription | null> {
  const [row] = await db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.tenantId, tenantId))
    .limit(1);

  return row ?? null;
}

/**
 * Distinct people actually paid within a window.
 *
 * Counts `paid` payouts only. A failed payout is not a person paid, and billing
 * for one would be both wrong and obvious.
 */
export async function countPeoplePaid(
  db: EngineDb,
  tenantId: string,
  from: Date,
  to: Date
): Promise<number> {
  const [row] = await db
    .select({
      count: sql<number>`count(distinct ${schema.payouts.contributorId})::int`,
    })
    .from(schema.payouts)
    .where(
      and(
        eq(schema.payouts.tenantId, tenantId),
        eq(schema.payouts.status, "paid"),
        gte(schema.payouts.completedAt, from),
        lt(schema.payouts.completedAt, to)
      )
    );

  return row?.count ?? 0;
}

export interface UsageSnapshot {
  plan: Plan | null;
  planKey: string;
  peoplethisPeriod: number;
  peopleLimit: number | null;
  overLimit: boolean;
  /** The plan we would suggest. Null when they fit, or are past the largest. */
  suggestedPlan: Plan | null;
  /** True above the largest plan — a conversation, not an automatic anything. */
  needsCustomPlan: boolean;
  /** The MONTHLY window the count covers. */
  periodStart: Date;
  periodEnd: Date;
  /** When they are next invoiced — a year out on an annual plan. */
  billingPeriodEnd: Date;
  billingInterval: BillingInterval;
}

/**
 * What to SHOW the customer about their usage.
 *
 * Note the return type: a description, not a permission. There is no boolean
 * here that any caller should treat as "may they proceed".
 */
export async function getUsage(
  db: EngineDb,
  tenantId: string,
  now = new Date()
): Promise<UsageSnapshot | null> {
  const subscription = await getSubscription(db, tenantId);
  if (!subscription) return null;

  const plan = findPlan(subscription.planKey);

  // The MONTHLY window, not the billing period — see `currentUsageWindow`.
  const window = currentUsageWindow(subscription, now);
  const people = await countPeoplePaid(
    db,
    tenantId,
    window.from,
    window.to > now ? now : window.to
  );

  const limit = plan?.peopleLimit ?? null;
  const overLimit = limit !== null && people > limit;
  const suggested = overLimit ? smallestPlanFor(people) : null;

  return {
    plan,
    planKey: subscription.planKey,
    peoplethisPeriod: people,
    peopleLimit: limit,
    overLimit,
    suggestedPlan: suggested,
    needsCustomPlan: overLimit && suggested === null,
    // The usage window, which is what the count above is measured over. On an
    // annual plan this is NOT the billing period.
    periodStart: window.from,
    periodEnd: window.to,
    billingPeriodEnd: subscription.periodEnd,
    billingInterval: subscription.billingInterval as BillingInterval,
  };
}

/**
 * Note that usage went past the plan.
 *
 * ⚠️ WRITES A NOTICE. DOES NOT WRITE `planKey`, AND DOES NOT CHARGE ANYTHING.
 * The whole value of this record is that when the plan does move up at renewal,
 * it moves up against a notice the customer already received — which is what
 * keeps §12 rule 2 ("never silently increase a bill from a usage count") true
 * while still not letting someone sit on the smallest plan forever.
 *
 * Idempotent within a period: the first crossing stamps the time, later calls
 * only keep the peak count fresh. Re-stamping would reset the notice period
 * every time somebody was paid.
 */
export async function recordUsageOverage(
  db: EngineDb,
  tenantId: string,
  peopleCount: number,
  now = new Date()
): Promise<void> {
  const subscription = await getSubscription(db, tenantId);
  if (!subscription) return;

  const alreadyNoticed = subscription.overageNoticedAt !== null;
  const previousPeak = subscription.overagePeopleCount ?? 0;

  await db
    .update(schema.subscriptions)
    .set({
      overageNoticedAt: alreadyNoticed ? subscription.overageNoticedAt : now,
      overagePeopleCount: Math.max(previousPeak, peopleCount),
      updatedAt: now,
    })
    .where(eq(schema.subscriptions.id, subscription.id));
}

/**
 * Whether they are paying for more than they use — and should be told.
 *
 * ⚠️ THIS IS DELIBERATE LOST REVENUE, AND IT IS WORTH IT. A customer who
 * upgraded for one busy month and then quietened down will keep paying the
 * larger fee indefinitely unless somebody says something. Silence there is a
 * well-known and very effective revenue source.
 *
 * It is also, for THIS product specifically, a bad trade. The entire pitch is
 * "your numbers are honest and you can see them." A customer who works out six
 * months late that they have been paying $99 for a $49 month has learned
 * something about us that costs far more than the $300 it earned.
 *
 * Symmetric with `recordUsageOverage` on purpose: we tell them when they are
 * over, so we tell them when they are under.
 *
 * SUGGESTS, NEVER ACTS — same rule as the overage side. Auto-downgrading would
 * drop somebody onto a plan that is too small exactly as they scale back up,
 * generating an overage notice they never asked for. And some businesses keep
 * headroom on purpose; that is their call to make, not ours.
 *
 * Requires the pattern to hold for TWO consecutive periods. One quiet month is
 * noise — a seasonal business would otherwise be nagged every off-month.
 */
export async function suggestDowngrade(
  db: EngineDb,
  tenantId: string,
  now = new Date()
): Promise<Plan | null> {
  const subscription = await getSubscription(db, tenantId);
  if (!subscription) return null;

  // Only for people actually paying. Nagging a trial about saving money is
  // noise, and a lapsed account has a different conversation to have.
  if (subscription.status !== "active") return null;

  const current = findPlan(subscription.planKey);
  if (!current) return null;

  const periodLength =
    subscription.periodEnd.getTime() - subscription.periodStart.getTime();
  if (periodLength <= 0) return null;

  const previousStart = new Date(subscription.periodStart.getTime() - periodLength);

  const [thisPeriod, lastPeriod] = await Promise.all([
    countPeoplePaid(
      db,
      tenantId,
      subscription.periodStart,
      subscription.periodEnd > now ? now : subscription.periodEnd
    ),
    countPeoplePaid(db, tenantId, previousStart, subscription.periodStart),
  ]);

  // A period with no payouts at all is more likely "not using it yet" than
  // "over-provisioned", and a downgrade nudge is the wrong response to that.
  if (thisPeriod === 0 || lastPeriod === 0) return null;

  const peak = Math.max(thisPeriod, lastPeriod);
  const smaller = smallestPlanFor(peak);

  if (!smaller || smaller.key === current.key) return null;
  if (smaller.priceMinor >= current.priceMinor) return null;

  return smaller;
}

/**
 * `full` — everything works.
 * `read_only` — they can sign in and see everything, but cannot run a payout
 *               or change anything. Chosen by the user (2026-08-01) over
 *               locking people out: shutting somebody out of their own records
 *               reads badly and destroys goodwill, while read-only still
 *               creates the reason to pay. It also keeps §5 #14 possible —
 *               offboarding is an export, and you cannot export from a wall.
 * `none` — reserved. Nothing currently returns it; kept so a future hard
 *          suspension has somewhere to land rather than being bolted onto
 *          `read_only`.
 */
export type AccessLevel = "full" | "read_only" | "none";

export interface Entitlement {
  access: AccessLevel;
  /**
   * ⚠️ WHAT READ-ONLY ACTUALLY STOPS: running payouts, and admin writes.
   *
   * It must NEVER stop revenue being recorded. Webhooks keep ingesting, always.
   * A blocked write is an inconvenience the customer can undo by paying; a
   * dropped sale is a permanent hole in their ledger that no later payment
   * repairs, and they would not know it happened. Recording costs us nothing.
   */
  canRunPayouts: boolean;
  canWrite: boolean;
  /** Shown to the owner, in their language. Null when everything is fine. */
  message: string | null;
  /** Whether to nag about adding a card. */
  needsPaymentMethod: boolean;
}

const FULL_ACCESS = (message: string | null, needsPaymentMethod: boolean): Entitlement => ({
  access: "full",
  canRunPayouts: true,
  canWrite: true,
  message,
  needsPaymentMethod,
});

const READ_ONLY = (message: string): Entitlement => ({
  access: "read_only",
  canRunPayouts: false,
  canWrite: false,
  message,
  needsPaymentMethod: true,
});

/**
 * What an unpaid or lapsed subscription actually restricts.
 *
 * ⚠️ NOTE WHAT `past_due` DOES: nothing. A failed card keeps the product fully
 * working. This is a deliberate decision, not an oversight. Suspending a tenant
 * over a payment failure would stop contributors being paid — people who are
 * not our customer, had no part in the failure, and cannot resolve it. The
 * money at stake for us is $49; the cost to them is their income arriving late,
 * and the cost to the customer's trust in us is far more than a month's fee.
 *
 * Dunning belongs in email and in a banner, not in the payout path. Only an
 * explicit cancellation ends access, and even then the right behaviour on the
 * way out is an export, not a wall (§5 #14).
 */
export function entitlement(
  subscription: schema.Subscription | null,
  now = new Date()
): Entitlement {
  if (!subscription) {
    return READ_ONLY("This account has no subscription.");
  }

  switch (subscription.status) {
    case "trialing": {
      const endsAt = subscription.trialEndsAt;
      if (endsAt && endsAt <= now) {
        return READ_ONLY(
          "Your trial has ended. Choose a plan to start paying people again — everything you have set up is still here."
        );
      }
      return FULL_ACCESS(null, true);
    }

    case "active":
      return FULL_ACCESS(null, false);

    case "past_due":
      // ⚠️ STILL FULL ACCESS. See the block comment above before changing this.
      return FULL_ACCESS(
        subscription.lastPaymentError ??
          "We could not take your last payment. Please update your card.",
        true
      );

    case "canceled":
      return READ_ONLY(
        "This subscription has been cancelled. Your records are still here and can be exported."
      );
  }
}

/**
 * Move a tenant onto a different plan.
 *
 * The ONLY function that writes `planKey`, and it takes an explicit key from a
 * caller acting on the customer's instruction. Nothing derives the key from a
 * usage count.
 *
 * Clears the overage notice, because whatever was over is now covered — leaving
 * a stale notice would nag someone who has already done what was asked.
 */
export async function changePlan(
  db: EngineDb,
  tenantId: string,
  planKey: string,
  options: { actorId?: string; now?: Date; billingInterval?: BillingInterval } = {}
): Promise<void> {
  const now = options.now ?? new Date();
  const plan = findPlan(planKey);
  if (!plan) throw new SubscriptionError("That plan does not exist");

  const subscription = await getSubscription(db, tenantId);
  if (!subscription) throw new SubscriptionError("This account has no subscription");

  await db.transaction(async (tx) => {
    await tx
      .update(schema.subscriptions)
      .set({
        planKey,
        ...(options.billingInterval
          ? { billingInterval: options.billingInterval }
          : {}),
        overageNoticedAt: null,
        overagePeopleCount: null,
        updatedAt: now,
      })
      .where(eq(schema.subscriptions.id, subscription.id));

    await tx.insert(schema.auditLog).values({
      tenantId,
      actorType: "tenant_user",
      actorId: options.actorId ?? null,
      action: "change_plan",
      entityType: "subscription",
      entityId: subscription.id,
      before: {
        planKey: subscription.planKey,
        billingInterval: subscription.billingInterval,
      },
      after: {
        planKey,
        billingInterval: options.billingInterval ?? subscription.billingInterval,
      },
    });
  });
}
