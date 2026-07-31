/**
 * Which transfer executor the running process uses.
 *
 * Mirrors `server/lib/cost-resolver-factory.ts` exactly, and for the same
 * reason: the default when nothing is configured must be the one that refuses,
 * not the one that pretends.
 *
 *   • `STRIPE_SECRET_KEY` present  → real transfers.
 *   • `ALLOW_FIXTURE_TRANSFERS=true` and no key → fixture, loudly.
 *   • Neither → `UnconfiguredTransferExecutor`, which fails every payout with
 *     an honest reason and writes no ledger entry.
 *
 * THE FIXTURE IS OPT-IN, NOT A FALLBACK. A fixture executor returns
 * `succeeded` and a plausible transfer id, which makes the payout console show
 * a completed run and debits the ledger — a contributor's balance goes to zero
 * having received nothing. That is strictly worse than a failed run, so it can
 * only happen when somebody has explicitly asked for it.
 *
 * WHY THE KEY IS READ FROM THE ENVIRONMENT AND THE ACCOUNT FROM THE TENANT.
 * The secret key is *ours* — the platform's Connect key, one per deployment.
 * The account transfers are made from is the *tenant's*, stored on their row,
 * because we never hold their funds (ratified decision #1). Conflating the two
 * is how a platform ends up as an unlicensed money transmitter.
 */

import {
  FixtureTransferExecutor,
  UnconfiguredTransferExecutor,
  type TransferExecutor,
} from "../../payout";
import { FixtureStripeClient, LiveStripeClient, type StripeSdkLike } from "./client";
import { StripeTransferExecutor } from "./transfer-executor";

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

let overrideExecutor: TransferExecutor | null = null;

/**
 * Test seam — install an executor without touching the environment.
 *
 * Deliberately not cached the way `getCostResolver` caches, because the
 * executor depends on which tenant is paying and a process-wide singleton would
 * quietly send one tenant's payouts out of another tenant's account.
 */
export function setTransferExecutor(executor: TransferExecutor | null): void {
  overrideExecutor = executor;
}

export interface TransferExecutorOptions {
  /** The tenant's connected account. Transfers are instructed against it. */
  tenantStripeAccountId?: string | null;
  /** Injected Stripe SDK, so this module never imports the SDK at type level. */
  sdk?: StripeSdkLike;
}

export async function getTransferExecutor(
  options: TransferExecutorOptions = {}
): Promise<TransferExecutor> {
  if (overrideExecutor) return overrideExecutor;

  if (isStripeConfigured()) {
    const sdk = options.sdk ?? (await loadStripeSdk());
    if (sdk) {
      return new StripeTransferExecutor({
        client: new LiveStripeClient(sdk),
        onBehalfOfAccount: options.tenantStripeAccountId ?? undefined,
      });
    }
    console.error(
      "[transfer-executor] STRIPE_SECRET_KEY is set but the Stripe SDK could not be loaded. " +
        "Refusing to move money."
    );
    return new UnconfiguredTransferExecutor();
  }

  if (process.env.ALLOW_FIXTURE_TRANSFERS === "true") {
    console.warn(
      "[transfer-executor] Stripe is not configured; using a FIXTURE executor. " +
        "Payouts will be marked paid and balances debited, and NO MONEY WILL MOVE."
    );
    return new StripeTransferExecutor({
      client: new FixtureStripeClient(),
      onBehalfOfAccount: options.tenantStripeAccountId ?? undefined,
    });
  }

  return new UnconfiguredTransferExecutor();
}

/**
 * Load the Stripe SDK lazily.
 *
 * Dynamic so that a deployment with no Stripe key does not pay to import it,
 * and so that this module has no static dependency on the package — which is
 * what lets the whole payout path be tested in an environment where Stripe is
 * neither installed nor reachable.
 */
async function loadStripeSdk(): Promise<StripeSdkLike | null> {
  try {
    const mod = await import("stripe");
    const Stripe = (mod.default ?? mod) as unknown as new (
      key: string,
      config?: Record<string, unknown>
    ) => StripeSdkLike;
    return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-02-24.acacia" });
  } catch (error) {
    console.error("[transfer-executor] Could not load the Stripe SDK", error);
    return null;
  }
}

/** Re-exported so callers can construct a dry-run executor explicitly. */
export { FixtureTransferExecutor, UnconfiguredTransferExecutor };
