/**
 * Reversals and clawbacks (§8).
 *
 * §8 calls this "the #1 killer of payout systems in production and the most
 * expensive thing on this list to retrofit". It is built with the ledger rather
 * than after it, for a specific reason: a reversal is only cheap if balances are
 * allowed to go negative and allocations are immutable. Both are properties of
 * the ledger model, so bolting reversals on later means changing the model that
 * everything else already depends on.
 *
 * THE CENTRAL CASE. A sale earns a contributor $21.86. Twelve days later they
 * are paid. Forty days after that the customer charges back. The $21.86 is gone
 * — we never held it (ratified decision #1), and the contributor has spent it.
 * The system cannot make that money reappear. What it *can* do is record the
 * truth and apply the tenant's chosen policy:
 *
 *   recoup  — the contributor's balance goes to −$21.86 and their next earnings
 *             pay it back. The most common choice and the default.
 *   absorb  — the tenant eats it; the contributor's balance is untouched.
 *   reserve — a percentage was withheld from every payout precisely for this,
 *             and the reversal draws against that reserve first.
 *
 * The reversal itself is recorded identically in all three cases. Policy decides
 * only who ends up carrying it, which is why policy is applied *after* the
 * reversing allocations exist rather than being tangled into their computation.
 */

import { applyBasisPoints, formatMoney, sumMinor } from "./money";
import type { LedgerEntryInput } from "./ledger";

export type ClawbackPolicy = "recoup" | "absorb" | "reserve";

/** An allocation that already exists and is now being reversed. */
export interface ReversibleAllocation {
  id: string;
  contributorId: string;
  amountMinor: bigint;
  currency: string;
  ruleId: string | null;
  ruleKey: string | null;
  ruleVersion: number | null;
  grossAmountMinor: bigint;
  deductedCostsMinor: bigint;
  basisAmountMinor: bigint;
  basis: string;
  method: string;
  rateBasisPoints: number | null;
  explanation: string | null;
}

export interface ReversingAllocation {
  reversesAllocationId: string;
  contributorId: string;
  amountMinor: bigint;
  currency: string;
  ruleId: string | null;
  ruleKey: string | null;
  ruleVersion: number | null;
  grossAmountMinor: bigint;
  deductedCostsMinor: bigint;
  basisAmountMinor: bigint;
  basis: string;
  method: string;
  rateBasisPoints: number | null;
  explanation: string;
}

export class ReversalError extends Error {}

/**
 * Build the reversing allocations for a set of originals.
 *
 * Exact negation, not recomputation. Recomputing from the current rule would
 * reverse a *different* amount than was paid whenever the rule has changed since
 * — which is exactly the situation effective dating exists to handle, and
 * exactly the situation in which getting it wrong is hardest to notice.
 *
 * `partialBasisPoints` supports partial refunds: 5000 reverses half. The
 * proportion is applied to each original allocation independently so the parts
 * stay consistent with what each contributor was actually credited.
 */
export function buildReversingAllocations(
  originals: ReversibleAllocation[],
  options: { partialBasisPoints?: number; reason?: string } = {}
): ReversingAllocation[] {
  const share = options.partialBasisPoints ?? 10000;

  if (share <= 0 || share > 10000) {
    throw new ReversalError(
      `partialBasisPoints must be in (0, 10000], got ${share}`
    );
  }

  return originals
    .map((original) => {
      const reversedAmount =
        share === 10000
          ? -original.amountMinor
          : -applyBasisPoints(original.amountMinor, share);

      const proportion = share === 10000 ? "" : ` (${share / 100}% partial)`;
      const reason = options.reason ? `: ${options.reason}` : "";

      return {
        reversesAllocationId: original.id,
        contributorId: original.contributorId,
        amountMinor: reversedAmount,
        currency: original.currency,
        ruleId: original.ruleId,
        ruleKey: original.ruleKey,
        ruleVersion: original.ruleVersion,
        grossAmountMinor: -original.grossAmountMinor,
        deductedCostsMinor: -original.deductedCostsMinor,
        basisAmountMinor: -original.basisAmountMinor,
        basis: original.basis,
        method: original.method,
        rateBasisPoints: original.rateBasisPoints,
        explanation:
          `Reversal${proportion} of allocation ${original.id}${reason}. ` +
          `Original: ${original.explanation ?? "(no explanation recorded)"}`,
      };
    })
    .filter((reversal) => reversal.amountMinor !== 0n);
}

export interface ClawbackOutcome {
  /** Ledger entries to append. Empty when the policy absorbs the loss. */
  entries: LedgerEntryInput[];
  /** How much the contributor's balance actually moved. */
  contributorImpactMinor: bigint;
  /** How much the tenant absorbed. */
  tenantAbsorbedMinor: bigint;
  /** How much was drawn from the contributor's reserve. */
  reserveDrawnMinor: bigint;
  policy: ClawbackPolicy;
  explanation: string;
}

/**
 * Apply the tenant's clawback policy to a set of reversing allocations.
 *
 * Returns the ledger entries to append, which is the only thing that actually
 * moves money. Nothing here mutates an existing allocation or entry — the
 * original stays exactly as it was, and the correction is additive (§5 #7).
 */
export function applyClawbackPolicy(
  reversals: ReversingAllocation[],
  options: {
    tenantId: string;
    policy: ClawbackPolicy;
    occurredAt: Date;
    /** Reserve currently held for each contributor, for `reserve` policy. */
    reserveByContributorMinor?: Record<string, bigint>;
  }
): ClawbackOutcome {
  const totalReversedMinor = sumMinor(reversals.map((r) => r.amountMinor)); // negative

  if (options.policy === "absorb") {
    return {
      entries: [],
      contributorImpactMinor: 0n,
      tenantAbsorbedMinor: totalReversedMinor,
      reserveDrawnMinor: 0n,
      policy: "absorb",
      explanation:
        `Tenant absorbed ${-totalReversedMinor} minor units; contributor balances untouched`,
    };
  }

  if (options.policy === "recoup") {
    const entries: LedgerEntryInput[] = reversals.map((reversal) => ({
      tenantId: options.tenantId,
      contributorId: reversal.contributorId,
      entryType: "reversal" as const,
      amountMinor: reversal.amountMinor,
      currency: reversal.currency,
      // Debits are never held — see the asymmetry note in ledger.ts.
      availableAt: null,
      description: reversal.explanation,
      occurredAt: options.occurredAt,
    }));

    return {
      entries,
      contributorImpactMinor: totalReversedMinor,
      tenantAbsorbedMinor: 0n,
      reserveDrawnMinor: 0n,
      policy: "recoup",
      explanation:
        `Recouped ${-totalReversedMinor} minor units against contributor balances; ` +
        "balances may be negative until future earnings recover them",
    };
  }

  // reserve — draw against what was withheld, and recoup only the shortfall.
  const reserves = options.reserveByContributorMinor ?? {};
  const entries: LedgerEntryInput[] = [];
  let reserveDrawnMinor = 0n;
  let contributorImpactMinor = 0n;

  for (const reversal of reversals) {
    const owed = -reversal.amountMinor; // positive magnitude
    const available = reserves[reversal.contributorId] ?? 0n;
    const fromReserve = available >= owed ? owed : available;
    const shortfall = owed - fromReserve;

    reserveDrawnMinor += fromReserve;

    if (shortfall > 0n) {
      contributorImpactMinor -= shortfall;
      entries.push({
        tenantId: options.tenantId,
        contributorId: reversal.contributorId,
        entryType: "reversal",
        amountMinor: -shortfall,
        currency: reversal.currency,
        availableAt: null,
        description:
          `${reversal.explanation} Reserve covered ${fromReserve} minor units; ` +
          `${shortfall} recouped from balance.`,
        occurredAt: options.occurredAt,
      });
    }
  }

  return {
    entries,
    contributorImpactMinor,
    tenantAbsorbedMinor: 0n,
    reserveDrawnMinor,
    policy: "reserve",
    explanation:
      `Drew ${reserveDrawnMinor} minor units from reserve; ` +
      `${-contributorImpactMinor} recouped from balances as shortfall`,
  };
}

/**
 * How much of a payout to withhold as reserve.
 *
 * Only meaningful under the `reserve` policy. Returns zero otherwise, so the
 * caller can apply it unconditionally.
 */
export function reserveForPayout(
  payableMinor: bigint,
  policy: ClawbackPolicy,
  reserveBasisPoints: number
): bigint {
  if (policy !== "reserve" || reserveBasisPoints <= 0) return 0n;
  if (payableMinor <= 0n) return 0n;
  return applyBasisPoints(payableMinor, reserveBasisPoints);
}

/**
 * Should this reversal be blocked pending human review?
 *
 * A reversal arriving against a contributor who has already been paid and has
 * no balance to absorb it is not a routine event — it is the tenant carrying a
 * real loss or chasing a real debt. Surfacing it beats silently parking a
 * negative balance that nobody looks at until the contributor next logs in.
 */
export function needsReview(
  contributorBalanceMinor: bigint,
  reversalAmountMinor: bigint,
  policy: ClawbackPolicy
): { needsReview: boolean; reason?: string } {
  if (policy === "absorb") return { needsReview: false };

  const resulting = contributorBalanceMinor + reversalAmountMinor;
  if (resulting < 0n) {
    // Formatted, not raw minor units: this string is shown to the business
    // owner in the admin console, and "-2185 minor units" is meaningless to
    // the person whose money it is.
    return {
      needsReview: true,
      reason:
        `This refund leaves them owing ${formatMoney(-resulting)}. ` +
        "The money had already been paid out, so it will be recovered from their future earnings.",
    };
  }

  return { needsReview: false };
}
