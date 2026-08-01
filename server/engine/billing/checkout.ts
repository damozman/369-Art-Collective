/**
 * Turning "they clicked subscribe" into a paid subscription.
 *
 * ⚠️ THE RULE THAT SHAPES THIS FILE: a subscription becomes `active` ONLY
 * because Stripe said so, never because a browser reached the success URL.
 *
 * This is the same lesson `payout-account.ts` records about `payoutsEnabled`,
 * and it is worth restating because the temptation is identical. A success URL
 * is a redirect: the customer can navigate to it directly, close the tab before
 * it loads, or arrive there while the card is still being authorised. Marking
 * someone paid on arrival gives away the product for a URL, and — more often —
 * fails the honest customer whose browser died on the way back.
 *
 * So `completeCheckout` reads the subscription back from Stripe and writes what
 * Stripe reports. The success URL only decides what the customer *sees*.
 */

import { eq } from "drizzle-orm";

import * as schema from "@shared/engine-schema";
import type { EngineDb } from "../ingest";
import type { BillingClient } from "./billing-client";
import { mapStripeStatus } from "./live-billing-client";
import { findPlan, priceFor, type BillingInterval } from "./plans";
import { SubscriptionError, getSubscription } from "./subscription";

/**
 * Ensure the tenant exists as a customer on OUR Stripe account, and hand back
 * a checkout link.
 *
 * The customer id is stored so a repeat visit reuses it. Minting a second
 * customer for the same tenant scatters their invoices across two records and
 * makes the billing portal show a history with holes in it — the same class of
 * mistake as minting a second connected account for a contributor.
 */
export async function startCheckout(
  db: EngineDb,
  options: {
    tenantId: string;
    planKey: string;
    interval: BillingInterval;
    successUrl: string;
    cancelUrl: string;
    client: BillingClient;
  }
): Promise<{ url: string }> {
  const plan = findPlan(options.planKey);
  if (!plan) throw new SubscriptionError("That plan does not exist");

  const subscription = await getSubscription(db, options.tenantId);
  if (!subscription) throw new SubscriptionError("This account has no subscription");

  const [tenant] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, options.tenantId))
    .limit(1);

  if (!tenant) throw new SubscriptionError("That business no longer exists");

  let customerId = subscription.stripeCustomerId;

  if (!customerId) {
    const [owner] = await db
      .select({ email: schema.tenantUsers.email })
      .from(schema.tenantUsers)
      .where(eq(schema.tenantUsers.tenantId, options.tenantId))
      .orderBy(schema.tenantUsers.createdAt)
      .limit(1);

    const customer = await options.client.createCustomer({
      tenantId: options.tenantId,
      businessName: tenant.name,
      email: owner?.email ?? "",
    });

    customerId = customer.id;

    await db
      .update(schema.subscriptions)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(schema.subscriptions.id, subscription.id));
  }

  const session = await options.client.createCheckoutSession({
    customerId,
    planKey: plan.key,
    interval: options.interval,
    amountMinor: priceFor(plan, options.interval),
    currency: plan.currency,
    successUrl: options.successUrl,
    cancelUrl: options.cancelUrl,
    tenantId: options.tenantId,
  });

  // The link is returned, never stored. Checkout sessions expire, and a cached
  // one is a support ticket — same reasoning as Stripe account links.
  return { url: session.url };
}

/**
 * Write back what Stripe reports about a subscription.
 *
 * Called from the return URL *and* from the webhook, and safe both ways: it
 * reads the truth from Stripe rather than trusting either caller. Running twice
 * is a no-op.
 *
 * Note what it does NOT do: it never sets `planKey` from anything except the
 * metadata we ourselves put on the subscription at checkout, and it never
 * touches the usage counters.
 */
export async function completeCheckout(
  db: EngineDb,
  options: {
    tenantId: string;
    stripeSubscriptionId: string;
    client: BillingClient;
    now?: Date;
  }
): Promise<{ status: string } | null> {
  const now = options.now ?? new Date();

  const remote = await options.client.getSubscription(options.stripeSubscriptionId);
  if (!remote) return null;

  // A subscription carrying another tenant's id must never be applied here.
  // The id arrives from a redirect or a webhook body, so it is attacker-shaped
  // input until this check has run.
  if (remote.tenantId && remote.tenantId !== options.tenantId) {
    throw new SubscriptionError("That subscription belongs to a different business");
  }

  const subscription = await getSubscription(db, options.tenantId);
  if (!subscription) throw new SubscriptionError("This account has no subscription");

  const status = mapStripeStatus(remote.status);
  const plan = remote.planKey ? findPlan(remote.planKey) : null;

  await db
    .update(schema.subscriptions)
    .set({
      status,
      // Only adopt the plan Stripe reports when we recognise it. An unknown key
      // would otherwise overwrite a good plan with a string nothing can price.
      ...(plan ? { planKey: plan.key } : {}),
      stripeSubscriptionId: remote.id,
      stripeCustomerId: remote.customerId,
      periodEnd: remote.currentPeriodEnd,
      // Paying clears the trial: `entitlement` checks `trialEndsAt` on
      // `trialing` only, but leaving a past date behind is a trap for the next
      // person reading the row.
      ...(status === "active" ? { trialEndsAt: null, lastPaymentError: null } : {}),
      ...(status === "canceled" ? { canceledAt: now } : {}),
      updatedAt: now,
    })
    .where(eq(schema.subscriptions.id, subscription.id));

  return { status };
}

/**
 * Record that a payment failed.
 *
 * ⚠️ SETS `past_due`, WHICH DOES NOT RESTRICT ANYTHING. See `entitlement()`:
 * a failed card leaves the product fully working, because suspending a tenant
 * would stop contributors — who are not our customer and had no part in it —
 * from being paid. This function's entire job is to record the reason so a
 * banner and an email can ask them to fix it.
 */
export async function recordPaymentFailure(
  db: EngineDb,
  tenantId: string,
  reason: string,
  now = new Date()
): Promise<void> {
  const subscription = await getSubscription(db, tenantId);
  if (!subscription) return;

  // Never downgrade a cancelled subscription back into past_due — cancellation
  // is the later, more deliberate state.
  if (subscription.status === "canceled") return;

  await db
    .update(schema.subscriptions)
    .set({ status: "past_due", lastPaymentError: reason, updatedAt: now })
    .where(eq(schema.subscriptions.id, subscription.id));
}
