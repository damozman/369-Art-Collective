/**
 * Which billing client the running process uses.
 *
 * Same discipline as `adapters/stripe/factory.ts` and
 * `lib/cost-resolver-factory.ts`: the default when nothing is configured is the
 * one that REFUSES, never the one that pretends.
 *
 *   • `BILLING_STRIPE_SECRET_KEY` present → real charges.
 *   • `ALLOW_FIXTURE_BILLING=true` and no key → fixture, loudly.
 *   • Neither → `UnconfiguredBillingClient`, which throws with a readable
 *     reason rather than quietly producing a subscription nobody pays for.
 *
 * ⚠️ A SEPARATE ENVIRONMENT VARIABLE FROM `STRIPE_SECRET_KEY`, ON PURPOSE.
 * `STRIPE_SECRET_KEY` is the Connect key used to instruct transfers out of the
 * *tenant's* account. This one charges cards into *ours*. They may well be the
 * same Stripe account in practice, but naming them separately means a
 * deployment can have payouts working and billing switched off (which is
 * exactly the current state), and it makes the two surfaces impossible to
 * confuse in a config file. See `billing-client.ts` for why that matters.
 *
 * `ALLOW_FIXTURE_BILLING` is less dangerous than `ALLOW_FIXTURE_TRANSFERS` —
 * the worst case is unbilled revenue rather than a contributor's balance going
 * to zero having received nothing — but it is still opt-in, because a
 * deployment that thinks it is charging customers and is not takes months to
 * notice.
 */

import {
  FixtureBillingClient,
  UnconfiguredBillingClient,
  type BillingClient,
} from "./billing-client";
import { LiveBillingClient, type BillingSdkLike } from "./live-billing-client";

export function isBillingConfigured(): boolean {
  return Boolean(process.env.BILLING_STRIPE_SECRET_KEY);
}

let override: BillingClient | null = null;

/** Test seam — install a client without touching the environment. */
export function setBillingClient(client: BillingClient | null): void {
  override = client;
}

let cached: BillingClient | null = null;

export function getBillingClient(options: { sdk?: BillingSdkLike } = {}): BillingClient {
  if (override) return override;
  if (cached) return cached;

  const key = process.env.BILLING_STRIPE_SECRET_KEY;

  if (key) {
    cached = new LiveBillingClient({ apiKey: key, sdk: options.sdk });
    return cached;
  }

  if (process.env.ALLOW_FIXTURE_BILLING === "true") {
    console.warn(
      "[billing] ALLOW_FIXTURE_BILLING is set — subscriptions are simulated and " +
        "NO MONEY IS BEING CHARGED. Never set this in a real deployment."
    );
    cached = new FixtureBillingClient();
    return cached;
  }

  cached = new UnconfiguredBillingClient();
  return cached;
}

/** Tests only — the cache is process-wide. */
export function resetBillingClient(): void {
  cached = null;
  override = null;
}
