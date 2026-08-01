/**
 * The real billing client, against our own Stripe account.
 *
 * Never carries `Stripe-Account`. Every call here is on the platform's own
 * account, charging a customer for a subscription — see the header of
 * `billing-client.ts` for why that is a different surface from the transfer
 * path and must stay one.
 *
 * ⚠️ CARD DETAILS NEVER TOUCH THIS SERVER. Both payment journeys go through
 * Stripe-hosted pages: Checkout to subscribe, the Billing Portal to change a
 * card or cancel. That is a deliberate scope decision, not laziness — handling
 * a PAN directly would drag this deployment into PCI scope for the sake of a
 * slightly nicer form, and the credential-leak sweep in CLAUDE.md is a standing
 * reminder of how much sensitive data leaks through ordinary logging.
 *
 * The SDK is injected the same way the transfer client injects it: sandboxes
 * cannot reach `api.stripe.com`, so this class is never exercised here. What IS
 * exercised is the mapping — Stripe's status vocabulary into ours — which is
 * where the bugs actually live and which is pure.
 */

import {
  BillingClientError,
  type BillingClient,
  type BillingCustomer,
  type BillingCustomerParams,
  type BillingPortalParams,
  type BillingSubscriptionStatus,
  type CheckoutSession,
  type CheckoutSessionParams,
} from "./billing-client";

/** Only what billing touches. Six calls, all on our own account. */
export interface BillingSdkLike {
  customers: {
    create(params: Record<string, unknown>): Promise<{ id: string; email?: string | null }>;
  };
  checkout: {
    sessions: {
      create(params: Record<string, unknown>): Promise<{ id: string; url?: string | null }>;
    };
  };
  billingPortal: {
    sessions: {
      create(params: Record<string, unknown>): Promise<{ url: string }>;
    };
  };
  subscriptions: {
    retrieve(id: string): Promise<StripeSubscriptionLike>;
    update(id: string, params: Record<string, unknown>): Promise<unknown>;
  };
}

interface StripeSubscriptionLike {
  id: string;
  customer: string | { id: string };
  status: string;
  current_period_end: number;
  cancel_at_period_end?: boolean;
  metadata?: Record<string, string> | null;
}

/**
 * Stripe's subscription statuses, mapped to ours.
 *
 * PURE, EXPORTED, AND UNIT-TESTED, because this is the part that decides
 * whether a customer's product keeps working. Note the two that are easy to get
 * wrong:
 *
 *   `past_due`   → our `past_due`, which still grants FULL access. See
 *                  `entitlement()` — a failed card must not stop contributors
 *                  being paid.
 *   `unpaid`     → also `past_due`, NOT `canceled`. Stripe reaches `unpaid`
 *                  after exhausting retries, but the customer has not
 *                  cancelled and may still pay. Treating it as cancelled would
 *                  drop them to read-only over a card that eventually clears.
 *
 * `incomplete_expired` is the only one that maps to `canceled`, because that
 * subscription can never activate.
 */
export function mapStripeStatus(
  stripeStatus: string
): "trialing" | "active" | "past_due" | "canceled" {
  switch (stripeStatus) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
    case "incomplete":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      // An unfamiliar status is treated as still-owing rather than cancelled:
      // the failure mode is a customer keeping access they might not deserve,
      // which is far cheaper than cutting off one who paid.
      return "past_due";
  }
}

export class LiveBillingClient implements BillingClient {
  private readonly sdk: BillingSdkLike;

  constructor(options: { apiKey: string; sdk?: BillingSdkLike }) {
    if (options.sdk) {
      this.sdk = options.sdk;
      return;
    }
    // Loaded lazily so a deployment without billing configured never pulls the
    // SDK in at all.
    const require = createRequire();
    const Stripe = require("stripe");
    this.sdk = new Stripe(options.apiKey) as BillingSdkLike;
  }

  async createCustomer(params: BillingCustomerParams): Promise<BillingCustomer> {
    const customer = await this.sdk.customers.create({
      name: params.businessName,
      email: params.email,
      // Lets a Stripe-side record be traced back without a lookup table.
      metadata: { tenantId: params.tenantId },
    });

    return { id: customer.id, email: customer.email ?? params.email };
  }

  async createCheckoutSession(params: CheckoutSessionParams): Promise<CheckoutSession> {
    if (params.amountMinor <= 0n) {
      throw new BillingClientError("A subscription must cost something");
    }

    const session = await this.sdk.checkout.sessions.create({
      mode: "subscription",
      customer: params.customerId,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: params.currency.toLowerCase(),
            // bigint → number at the boundary. Safe here in a way it is not for
            // payouts: these are our own list prices, fixed in `plans.ts` and
            // far below the precision limit, not arbitrary accumulated totals.
            unit_amount: Number(params.amountMinor),
            recurring: {
              interval: params.interval === "annual" ? "year" : "month",
            },
            product_data: { name: `${params.planKey} plan` },
          },
        },
      ],
      // Echoed back on the webhook, which is the only way to tie a completed
      // checkout to a tenant without trusting the return URL.
      subscription_data: {
        metadata: { tenantId: params.tenantId, planKey: params.planKey },
      },
      metadata: { tenantId: params.tenantId, planKey: params.planKey },
    });

    if (!session.url) {
      throw new BillingClientError("Stripe did not return a checkout link");
    }

    return { id: session.id, url: session.url };
  }

  async createPortalSession(params: BillingPortalParams): Promise<{ url: string }> {
    const session = await this.sdk.billingPortal.sessions.create({
      customer: params.customerId,
      return_url: params.returnUrl,
    });
    return { url: session.url };
  }

  async getSubscription(subscriptionId: string): Promise<BillingSubscriptionStatus | null> {
    try {
      const sub = await this.sdk.subscriptions.retrieve(subscriptionId);
      return toBillingSubscription(sub);
    } catch (error) {
      if ((error as { code?: string }).code === "resource_missing") return null;
      throw error;
    }
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    // At period end, not immediately. They paid for the period; taking it away
    // early would be taking money for nothing.
    await this.sdk.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
  }
}

export function toBillingSubscription(
  sub: StripeSubscriptionLike
): BillingSubscriptionStatus {
  return {
    id: sub.id,
    customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    status: sub.status,
    currentPeriodEnd: new Date(sub.current_period_end * 1000),
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    planKey: sub.metadata?.planKey ?? null,
    tenantId: sub.metadata?.tenantId ?? null,
  };
}

function createRequire() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createRequire: make } = require("node:module") as typeof import("node:module");
  return make(import.meta.url);
}
