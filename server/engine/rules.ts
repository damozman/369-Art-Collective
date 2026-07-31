/**
 * The split rules engine (§6).
 *
 * Rules are DATA. This file evaluates them; it contains no tenant-specific
 * logic and no hardcoded rates. That is ratified decision #7 and §5 #9: the
 * marketplace's hardcoded 30/35/45 ladder could not serve a second customer,
 * let alone a second vertical, and no amount of adding parameters to it would
 * have fixed that.
 *
 * The engine is pure. It takes rules and an event, and returns computed
 * allocations plus an explanation. It touches no database and no clock — the
 * caller supplies `occurredAt`, because rule selection must be relative to when
 * the revenue happened, never to now (§5 #5). Evaluating a February sale today
 * must produce February's answer.
 *
 * EVALUATION ORDER
 *
 *   1. Discard rules not active, or not effective at the event's `occurredAt`.
 *   2. Discard rules whose scope does not match the event.
 *   3. Group the survivors by contributor.
 *   4. Within each contributor, the highest `priority` wins; ties break by
 *      scope specificity (work > contributor > product_type > tenant), then by
 *      the most recent `effectiveFrom`. Exactly one rule pays each contributor
 *      per event — overlapping rules are resolved, never summed, because
 *      summing silently double-pays when a tenant adds a rule they thought
 *      replaced an old one.
 *   5. Compute each allocation, then check the total against 100%.
 */

import {
  applyBasisPoints,
  assertSameCurrency,
  formatMoney,
  sumMinor,
} from "./money";
import { netForDeductions, type CostInput, type RevenueEvent } from "./revenue-event";

export type RuleBasis = "gross" | "net" | "unit";
export type RuleMethod = "percent" | "flat_per_unit" | "flat_per_event" | "tiered";
export type RuleScope = "tenant" | "contributor" | "work" | "product_type";

/** One rung of a volume ladder. `minMinor` is inclusive. */
export interface TierRung {
  minMinor: bigint;
  basisPoints: number;
}

/**
 * A rule as the engine sees it — the row from `splitRules`, with bigints
 * already converted.
 */
export interface EvaluableRule {
  id: string;
  ruleKey: string;
  version: number;

  effectiveFrom: Date;
  effectiveTo: Date | null;

  scope: RuleScope;
  scopeRef: string | null;

  /** Which contributor this pays. Null means every contributor on the event. */
  contributorId: string | null;
  role: string | null;

  basis: RuleBasis;
  method: RuleMethod;

  valueBasisPoints: number | null;
  valueMinor: bigint | null;
  tierTable: TierRung[] | null;

  costDeductions: string[];
  priority: number;
  currency: string;
  active: boolean;
}

/** What the event looks like once contributors and the work are resolved. */
export interface RuleContext {
  tenantId: string;
  occurredAt: Date;
  workId: string | null;
  productType: string | null;
  contributors: Array<{
    contributorId: string;
    role?: string;
    /** Explicit share from the source, when the source carries the split. */
    shareBasisPoints?: number;
    /**
     * Trailing volume for tiered rules, in minor units. Supplied by the caller
     * as a DERIVED figure — never a stored balance (§5 #4).
     */
    trailingVolumeMinor?: bigint;
  }>;
}

/** One step of the derivation, for rendering a structured trace. */
export interface TraceStep {
  label: string;
  amountMinor?: bigint;
  detail?: string;
}

export interface ComputedAllocation {
  contributorId: string;
  amountMinor: bigint;
  currency: string;

  ruleId: string;
  ruleKey: string;
  ruleVersion: number;

  grossAmountMinor: bigint;
  deductedCostsMinor: bigint;
  basisAmountMinor: bigint;
  basis: RuleBasis;
  method: RuleMethod;
  rateBasisPoints: number | null;

  explanation: string;
  trace: TraceStep[];
}

export interface EvaluationResult {
  allocations: ComputedAllocation[];
  /** What the tenant keeps: gross minus every allocation. May be negative. */
  remainderMinor: bigint;
  warnings: string[];
}

export class RuleEvaluationError extends Error {}

// ============================================================
// Selection
// ============================================================

/** Scope specificity, used to break priority ties. Higher is more specific. */
const SCOPE_SPECIFICITY: Record<RuleScope, number> = {
  work: 3,
  contributor: 2,
  product_type: 1,
  tenant: 0,
};

/**
 * Is this rule in force at `occurredAt`?
 *
 * `effectiveFrom` is inclusive, `effectiveTo` exclusive — so a rule ending and
 * its replacement starting at the same instant leaves no gap and no overlap.
 */
export function isEffectiveAt(rule: EvaluableRule, occurredAt: Date): boolean {
  if (!rule.active) return false;
  if (occurredAt < rule.effectiveFrom) return false;
  if (rule.effectiveTo && occurredAt >= rule.effectiveTo) return false;
  return true;
}

function scopeMatches(
  rule: EvaluableRule,
  context: RuleContext,
  contributorId: string,
  role?: string
): boolean {
  if (rule.contributorId && rule.contributorId !== contributorId) return false;
  if (rule.role && rule.role !== role) return false;

  switch (rule.scope) {
    case "tenant":
      return true;
    case "contributor":
      return rule.scopeRef === contributorId;
    case "work":
      return context.workId !== null && rule.scopeRef === context.workId;
    case "product_type":
      return context.productType !== null && rule.scopeRef === context.productType;
    default:
      return false;
  }
}

/**
 * Pick the one rule that pays a given contributor for this event.
 *
 * Returns null when nothing applies — which is a legitimate outcome, not an
 * error. A contributor with no applicable rule is owed nothing, and the caller
 * flags the event for review rather than inventing a default rate.
 */
export function selectRule(
  rules: EvaluableRule[],
  context: RuleContext,
  contributorId: string,
  role?: string
): EvaluableRule | null {
  const candidates = rules
    .filter((rule) => isEffectiveAt(rule, context.occurredAt))
    .filter((rule) => scopeMatches(rule, context, contributorId, role));

  if (candidates.length === 0) return null;

  const [winner] = candidates.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;

    const specificity =
      SCOPE_SPECIFICITY[b.scope] - SCOPE_SPECIFICITY[a.scope];
    if (specificity !== 0) return specificity;

    // Most recently effective wins a remaining tie.
    return b.effectiveFrom.getTime() - a.effectiveFrom.getTime();
  });

  return winner;
}

// ============================================================
// Computation
// ============================================================

/** Resolve a tiered ladder against trailing volume. Rungs may be unsorted. */
export function resolveTier(tierTable: TierRung[], trailingVolumeMinor: bigint): number {
  const descending = [...tierTable].sort((a, b) =>
    b.minMinor > a.minMinor ? 1 : b.minMinor < a.minMinor ? -1 : 0
  );
  const rung = descending.find((r) => trailingVolumeMinor >= r.minMinor);
  if (!rung) {
    throw new RuleEvaluationError(
      `No tier rung matches trailing volume ${trailingVolumeMinor}; ladder needs a rung at 0`
    );
  }
  return rung.basisPoints;
}

function describeCosts(costs: CostInput[], deductTypes: string[]): string {
  const deductible = new Set(deductTypes);
  const parts = costs
    .filter((c) => deductible.has(c.type))
    .map((c) => `${c.type} ${formatMoney(c.amountMinor < 0n ? -c.amountMinor : c.amountMinor)}`);
  return parts.join(" − ");
}

/**
 * Compute one contributor's allocation under one rule.
 *
 * Every input that goes into the number is captured on the way out (§5 #6).
 * The point is not tidiness: when a contributor disputes a payout eight months
 * later, this is what answers them, and re-deriving it from the rule as it
 * reads *today* would answer a different question.
 */
export function computeAllocation(
  rule: EvaluableRule,
  event: RevenueEvent,
  context: RuleContext,
  contributor: RuleContext["contributors"][number]
): ComputedAllocation {
  const currency = assertSameCurrency(
    [event.currency, rule.currency],
    `rule ${rule.ruleKey} v${rule.version}`
  );

  const { netMinor, deductedMinor } = netForDeductions(
    event.grossAmountMinor,
    event.costs,
    rule.costDeductions
  );

  const trace: TraceStep[] = [
    {
      label: "Gross",
      amountMinor: event.grossAmountMinor,
      detail: `${event.quantity} x ${formatMoney(
        event.quantity === 0
          ? 0n
          : event.grossAmountMinor / BigInt(event.quantity),
        currency
      )}`,
    },
  ];

  let basisAmountMinor: bigint;
  switch (rule.basis) {
    case "gross":
      basisAmountMinor = event.grossAmountMinor;
      break;
    case "net":
      basisAmountMinor = netMinor;
      if (rule.costDeductions.length > 0) {
        trace.push({
          label: "Less deductions",
          amountMinor: -deductedMinor,
          detail: describeCosts(event.costs, rule.costDeductions),
        });
      }
      trace.push({ label: "Net", amountMinor: netMinor });
      break;
    case "unit":
      basisAmountMinor = BigInt(event.quantity);
      break;
    default:
      throw new RuleEvaluationError(`Unknown basis "${rule.basis}"`);
  }

  let amountMinor: bigint;
  let rateBasisPoints: number | null = null;

  switch (rule.method) {
    case "percent": {
      if (rule.valueBasisPoints === null) {
        throw new RuleEvaluationError(
          `Rule ${rule.ruleKey} v${rule.version} is percent but has no valueBasisPoints`
        );
      }
      rateBasisPoints = rule.valueBasisPoints;
      amountMinor = applyBasisPoints(basisAmountMinor, rateBasisPoints);
      trace.push({
        label: `${rateBasisPoints / 100}% of ${rule.basis}`,
        amountMinor,
      });
      break;
    }

    case "tiered": {
      if (!rule.tierTable || rule.tierTable.length === 0) {
        throw new RuleEvaluationError(
          `Rule ${rule.ruleKey} v${rule.version} is tiered but has no tierTable`
        );
      }
      const volume = contributor.trailingVolumeMinor ?? 0n;
      rateBasisPoints = resolveTier(rule.tierTable, volume);
      amountMinor = applyBasisPoints(basisAmountMinor, rateBasisPoints);
      trace.push({
        label: `Tier ${rateBasisPoints / 100}% (trailing volume ${formatMoney(volume, currency)})`,
        amountMinor,
      });
      break;
    }

    case "flat_per_unit": {
      if (rule.valueMinor === null) {
        throw new RuleEvaluationError(
          `Rule ${rule.ruleKey} v${rule.version} is flat_per_unit but has no valueMinor`
        );
      }
      // Follows the event's sign so a reversal gives back exactly what was paid.
      const sign = event.grossAmountMinor < 0n ? -1n : 1n;
      amountMinor = rule.valueMinor * BigInt(event.quantity) * sign;
      trace.push({
        label: `${formatMoney(rule.valueMinor, currency)} x ${event.quantity} units`,
        amountMinor,
      });
      break;
    }

    case "flat_per_event": {
      if (rule.valueMinor === null) {
        throw new RuleEvaluationError(
          `Rule ${rule.ruleKey} v${rule.version} is flat_per_event but has no valueMinor`
        );
      }
      const sign = event.grossAmountMinor < 0n ? -1n : 1n;
      amountMinor = rule.valueMinor * sign;
      trace.push({
        label: `${formatMoney(rule.valueMinor, currency)} per event`,
        amountMinor,
      });
      break;
    }

    default:
      throw new RuleEvaluationError(`Unknown method "${rule.method}"`);
  }

  // A source-supplied share subdivides the rule's result — used when a CSV
  // statement carries per-writer percentages that the tenant has no rule for.
  if (contributor.shareBasisPoints !== undefined) {
    const beforeShare = amountMinor;
    amountMinor = applyBasisPoints(amountMinor, contributor.shareBasisPoints);
    trace.push({
      label: `Share ${contributor.shareBasisPoints / 100}% of ${formatMoney(beforeShare, currency)}`,
      amountMinor,
    });
  }

  const explanation = buildExplanation(trace, rule, currency);

  return {
    contributorId: contributor.contributorId,
    amountMinor,
    currency,
    ruleId: rule.id,
    ruleKey: rule.ruleKey,
    ruleVersion: rule.version,
    grossAmountMinor: event.grossAmountMinor,
    deductedCostsMinor: deductedMinor,
    basisAmountMinor,
    basis: rule.basis,
    method: rule.method,
    rateBasisPoints,
    explanation,
    trace,
  };
}

function buildExplanation(
  trace: TraceStep[],
  rule: EvaluableRule,
  currency: string
): string {
  const steps = trace
    .map((step) => {
      const amount =
        step.amountMinor === undefined ? "" : ` ${formatMoney(step.amountMinor, currency)}`;
      const detail = step.detail ? ` (${step.detail})` : "";
      return `${step.label}${amount}${detail}`;
    })
    .join("; ");

  return `${steps} [rule ${rule.ruleKey} v${rule.version}]`;
}

// ============================================================
// Evaluation
// ============================================================

/**
 * Evaluate all applicable rules for an event.
 *
 * Contributors with no applicable rule are simply absent from the result —
 * the caller decides whether that warrants review. Nothing here invents a
 * default rate, because a default rate is how you pay somebody the wrong
 * amount confidently.
 */
export function evaluate(
  rules: EvaluableRule[],
  event: RevenueEvent,
  context: RuleContext
): EvaluationResult {
  const allocations: ComputedAllocation[] = [];
  const warnings: string[] = [];

  for (const contributor of context.contributors) {
    const rule = selectRule(rules, context, contributor.contributorId, contributor.role);

    if (!rule) {
      warnings.push(
        `No applicable rule for contributor ${contributor.contributorId} at ${context.occurredAt.toISOString()}`
      );
      continue;
    }

    allocations.push(computeAllocation(rule, event, context, contributor));
  }

  const totalAllocated = sumMinor(allocations.map((a) => a.amountMinor));
  const remainderMinor = event.grossAmountMinor - totalAllocated;

  // §6: multi-party splits must sum to <=100% with a defined remainder owner.
  // Over-allocation is a real possibility once a tenant has several rules, and
  // it is far better caught here than discovered when the transfers fail.
  const overAllocated =
    event.grossAmountMinor >= 0n
      ? totalAllocated > event.grossAmountMinor
      : totalAllocated < event.grossAmountMinor;

  if (overAllocated) {
    warnings.push(
      `Allocations total ${formatMoney(totalAllocated, event.currency)} which exceeds ` +
        `gross ${formatMoney(event.grossAmountMinor, event.currency)} — the tenant would owe more than the sale earned`
    );
  }

  return { allocations, remainderMinor, warnings };
}
