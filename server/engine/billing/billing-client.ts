/**
 * Taking the subscription payment, behind a seam.
 *
 * ⚠️ THIS IS OUR STRIPE ACCOUNT, NOT THE TENANT'S, AND THAT IS THE WHOLE POINT
 * OF KEEPING IT IN A SEPARATE FILE FROM `adapters/stripe/client.ts`.
 *
 *   adapters/stripe/client.ts  — the TENANT's account. Transfers their money to
 *                                their contributors. Every call carries
 *                                `Stripe-Account`. Never charges anyone.
 *   this file                  — OUR account. Charges the tenant a subscription.
 *                                Never carries `Stripe-Account`.
 *
 * The comment in that file says "a `charges.create` here would be the moment
 * this became money transmission". That is still true *there*. It is not true
 * here, and the distinction is the entire compliance posture (blueprint §11):
 *
 *   - Contributor money never enters an account we control. That is ratified
 *     decision #1, and it is why we are not a money transmitter.
 *   - Subscription revenue is our own income, the same as any software company
 *     taking a card. It has nothing to do with the funds flowing to
 *     contributors and must never be mixed with them.
 *
 * If you ever find yourself passing `onBehalfOfAccount` into a function in this
 * file, or a `tenantStripeAccountId` into a subscription call, stop — the two
 * surfaces have been crossed and the result would either bill the wrong party
 * or take a fee out of contributor funds.
 *
 * Same seam discipline as everywhere else: sandboxes cannot reach
 * `api.stripe.com`, so the state machine is proven against a fixture before it
 * ever meets a real card.
 */

export interface BillingCustomerParams {
  tenantId: string;
  businessName: string;
  email: string;
}

export interface BillingCustomer {
  id: string;
  email: string;
}

export interface CheckoutSessionParams {
  customerId: string;
  /** Our internal plan key, echoed back on the webhook. */
  planKey: string;
  interval: "monthly" | "annual";
  /** Minor units. Passed explicitly so the fixture and the live path agree. */
  amountMinor: bigint;
  currency: string;
  successUrl: string;
  cancelUrl: string;
  /** Ties the resulting subscription back to a tenant on the webhook. */
  tenantId: string;
}

export interface CheckoutSession {
  id: string;
  /** Where to send the browser. Short-lived — never store it. */
  url: string;
}

export interface BillingPortalParams {
  customerId: string;
  returnUrl: string;
}

export interface BillingSubscriptionStatus {
  id: string;
  customerId: string;
  /** Stripe's own vocabulary, mapped by the caller rather than here. */
  status: string;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  planKey: string | null;
  tenantId: string | null;
}

/**
 * The five calls billing needs. Deliberately small, for the same reason the
 * transfer client is: naming them makes it obvious when something reaches for
 * a sixth.
 */
export interface BillingClient {
  createCustomer(params: BillingCustomerParams): Promise<BillingCustomer>;
  /** Hosted checkout — we never see or store a card number. */
  createCheckoutSession(params: CheckoutSessionParams): Promise<CheckoutSession>;
  /** Stripe's hosted portal: change card, change plan, cancel. */
  createPortalSession(params: BillingPortalParams): Promise<{ url: string }>;
  getSubscription(subscriptionId: string): Promise<BillingSubscriptionStatus | null>;
  cancelSubscription(subscriptionId: string): Promise<void>;
}

export class BillingClientError extends Error {}

/**
 * The default. Refuses rather than pretending, exactly like
 * `UnconfiguredTransferExecutor`.
 *
 * A billing client that silently no-ops would let a trial expire into an
 * "active" subscription nobody is paying for, which is worse than a visible
 * failure because nothing looks wrong until the money is expected.
 */
export class UnconfiguredBillingClient implements BillingClient {
  private refuse(): never {
    throw new BillingClientError(
      "Billing is not configured on this deployment. Set BILLING_STRIPE_SECRET_KEY."
    );
  }

  async createCustomer(): Promise<BillingCustomer> {
    this.refuse();
  }
  async createCheckoutSession(): Promise<CheckoutSession> {
    this.refuse();
  }
  async createPortalSession(): Promise<{ url: string }> {
    this.refuse();
  }
  async getSubscription(): Promise<BillingSubscriptionStatus | null> {
    this.refuse();
  }
  async cancelSubscription(): Promise<void> {
    this.refuse();
  }
}

/**
 * In-memory billing, for tests and local work.
 *
 * Ids are derived from the inputs rather than a counter. A per-instance counter
 * mints colliding ids across instances, which is exactly the bug the fixture
 * transfer executor had — it hit a unique index during the first real-Postgres
 * run and nowhere else.
 */
export class FixtureBillingClient implements BillingClient {
  readonly customers = new Map<string, BillingCustomer>();
  readonly subscriptions = new Map<string, BillingSubscriptionStatus>();
  readonly checkouts: CheckoutSessionParams[] = [];

  async createCustomer(params: BillingCustomerParams): Promise<BillingCustomer> {
    const id = `cus_fixture_${params.tenantId}`;
    const customer = { id, email: params.email };
    this.customers.set(id, customer);
    return customer;
  }

  async createCheckoutSession(params: CheckoutSessionParams): Promise<CheckoutSession> {
    if (params.amountMinor <= 0n) {
      // No free tier (ratified decision #5); a zero-amount checkout would be a
      // bug producing a subscription nobody is charged for.
      throw new BillingClientError("A subscription must cost something");
    }
    this.checkouts.push(params);
    const id = `cs_fixture_${params.tenantId}_${params.planKey}_${params.interval}`;
    return { id, url: `https://checkout.example/${id}` };
  }

  async createPortalSession(params: BillingPortalParams): Promise<{ url: string }> {
    return { url: `https://portal.example/${params.customerId}` };
  }

  async getSubscription(subscriptionId: string): Promise<BillingSubscriptionStatus | null> {
    return this.subscriptions.get(subscriptionId) ?? null;
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    const existing = this.subscriptions.get(subscriptionId);
    if (existing) {
      this.subscriptions.set(subscriptionId, { ...existing, cancelAtPeriodEnd: true });
    }
  }

  /** Test helper: pretend Stripe completed a checkout. */
  completeCheckout(options: {
    tenantId: string;
    planKey: string;
    customerId: string;
    subscriptionId: string;
    currentPeriodEnd: Date;
    status?: string;
  }): BillingSubscriptionStatus {
    const record: BillingSubscriptionStatus = {
      id: options.subscriptionId,
      customerId: options.customerId,
      status: options.status ?? "active",
      currentPeriodEnd: options.currentPeriodEnd,
      cancelAtPeriodEnd: false,
      planKey: options.planKey,
      tenantId: options.tenantId,
    };
    this.subscriptions.set(options.subscriptionId, record);
    return record;
  }
}
