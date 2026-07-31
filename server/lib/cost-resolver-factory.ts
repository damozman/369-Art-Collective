/**
 * Which cost resolver the running process uses.
 *
 * Live credentials pick the Printify resolver. Without them the process falls
 * back to fixtures — but *only* when explicitly permitted by
 * `ALLOW_FIXTURE_COSTS`, because fixture costs are plausible-looking invented
 * numbers and paying real contributors from them would recreate the exact bug
 * Phase 0 step 5 exists to remove.
 *
 * In production with no Printify credentials, resolution fails, every line is
 * held for review, and nothing is paid. That is the correct outcome: no royalty
 * is better than a wrong one.
 */

import { FixtureCostResolver, PrintifyCostResolver, type CostResolver } from "./cost-resolver";
import { PRINTIFY_COST_FIXTURES } from "./__fixtures__/printify-costs";
import { isPrintifyConfigured } from "./printify";

let cached: CostResolver | null = null;

export function getCostResolver(): CostResolver {
  if (cached) return cached;

  if (isPrintifyConfigured()) {
    cached = new PrintifyCostResolver();
    return cached;
  }

  if (process.env.ALLOW_FIXTURE_COSTS === "true") {
    console.warn(
      "[cost-resolver] Printify is not configured; using FIXTURE costs. " +
        "These are invented numbers. Do not pay anyone from them."
    );
    cached = new FixtureCostResolver(PRINTIFY_COST_FIXTURES);
    return cached;
  }

  console.error(
    "[cost-resolver] Printify is not configured and ALLOW_FIXTURE_COSTS is not set. " +
      "Every line item will be held for review rather than costed from assumptions."
  );

  cached = {
    async resolveCost() {
      throw new Error(
        "No cost resolver available: PRINTIFY_API_TOKEN is not set and fixture costs are not permitted"
      );
    },
  };
  return cached;
}

/** Test seam — lets a test install a resolver without touching the environment. */
export function setCostResolver(resolver: CostResolver | null): void {
  cached = resolver;
}
