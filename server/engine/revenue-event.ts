/**
 * The canonical RevenueEvent (§7).
 *
 * Every adapter — Shopify webhook, Stripe event, CSV row, manual entry —
 * normalizes into this one shape, and nothing downstream of ingestion knows or
 * cares which vertical it came from. That boundary is the whole architectural
 * bet: §4 identifies ingestion and payout as the only two seams where verticals
 * differ, and this type is the first of them.
 *
 * Amounts are `bigint` minor units throughout. Rates are basis points. Neither
 * ever appears as a float.
 */


export type EventSource = "shopify" | "stripe" | "csv" | "manual";
export type EventDirection = "sale" | "reversal";

/** A cost attached to an event. `type` is free-form so tenants can name theirs. */
export interface CostInput {
  type: string;
  amountMinor: bigint;
  currency: string;
  /** Provenance — where the number came from, kept for audit. */
  source?: string;
  resolvedAt?: Date;
}

/** How an adapter refers to a contributor before we have resolved them. */
export interface ContributorRef {
  ref: string;
  role?: string;
  /**
   * Optional explicit share for this contributor, in basis points. Present when
   * the *source* carries the split (a CSV statement with per-writer shares),
   * absent when the split comes from rules.
   */
  shareBasisPoints?: number;
}

/**
 * The canonical shape. This is what adapters produce and what the engine consumes.
 */
export interface RevenueEvent {
  tenantId: string;
  source: EventSource;

  /**
   * The source system's own identifier for this transaction, and the idempotency
   * key (§5 #8). For Shopify this is `${orderId}:${lineItemId}` — the pair, not
   * the order, because one row is written per line item and the marketplace
   * learned the hard way that keying on the order alone silently discards lines.
   */
  sourceEventId: string;

  direction: EventDirection;
  /** Required on a reversal: the `sourceEventId` of the event being reversed. */
  reversesSourceEventId?: string;

  occurredAt: Date;

  /** Positive on a sale, negative on a reversal. The sign lives on the amount. */
  grossAmountMinor: bigint;
  currency: string;
  quantity: number;

  /** Unresolved reference to the work, resolved against `works.externalRef`. */
  workRef?: string;

  contributorRefs: ContributorRef[];

  costs: CostInput[];

  metadata?: Record<string, unknown>;
}

/** The outcome of resolving an event against a tenant's contributors and works. */
export interface ResolvedEvent {
  event: RevenueEvent;
  workId: string | null;
  resolved: Array<{
    contributorId: string;
    ref: string;
    role?: string;
    shareBasisPoints?: number;
  }>;
  /** Set when something could not be resolved. Nothing is owed from these. */
  needsReview: boolean;
  reviewReason?: string;
}

export class EventValidationError extends Error {
  constructor(message: string, readonly event: Partial<RevenueEvent>) {
    super(message);
    this.name = "EventValidationError";
  }
}

/**
 * Validate an event's internal consistency before it touches the database.
 *
 * These checks exist because every one of them, if violated, produces a payout
 * that is wrong rather than a crash that is obvious. A reversal with a positive
 * amount would *increase* what a contributor is owed when money was refunded.
 */
export function validateRevenueEvent(event: RevenueEvent): void {
  if (!event.tenantId) {
    throw new EventValidationError("Event has no tenantId — every row is tenant-scoped", event);
  }

  if (!event.sourceEventId) {
    throw new EventValidationError(
      "Event has no sourceEventId — idempotency is impossible without one",
      event
    );
  }

  if (!event.currency) {
    throw new EventValidationError("Event has no currency", event);
  }

  if (!Number.isInteger(event.quantity) || event.quantity < 0) {
    throw new EventValidationError(
      `Quantity must be a non-negative integer, got ${event.quantity}`,
      event
    );
  }

  if (event.direction === "reversal") {
    if (event.grossAmountMinor > 0n) {
      throw new EventValidationError(
        `Reversal must not have a positive gross (got ${event.grossAmountMinor}) — ` +
          "a refund that increases earnings is the exact bug this check exists to stop",
        event
      );
    }
    if (!event.reversesSourceEventId) {
      throw new EventValidationError(
        "Reversal must reference the event it reverses",
        event
      );
    }
  } else {
    if (event.grossAmountMinor < 0n) {
      throw new EventValidationError(
        `Sale must not have a negative gross (got ${event.grossAmountMinor}) — ` +
          "record it as a reversal instead so it references the original",
        event
      );
    }
    if (event.reversesSourceEventId) {
      throw new EventValidationError(
        "A sale must not reference an event to reverse",
        event
      );
    }
  }

  for (const cost of event.costs) {
    if (cost.currency !== event.currency) {
      throw new EventValidationError(
        `Cost "${cost.type}" is in ${cost.currency} but the event is in ${event.currency}`,
        event
      );
    }
    // On a reversal every cost is given back too, so costs follow the event's sign.
    if (event.direction === "reversal" && cost.amountMinor > 0n) {
      throw new EventValidationError(
        `Cost "${cost.type}" on a reversal must be negative or zero`,
        event
      );
    }
    if (event.direction === "sale" && cost.amountMinor < 0n) {
      throw new EventValidationError(
        `Cost "${cost.type}" on a sale must be positive or zero`,
        event
      );
    }
  }

  const seenTypes = new Set<string>();
  for (const cost of event.costs) {
    if (seenTypes.has(cost.type)) {
      throw new EventValidationError(
        `Duplicate cost type "${cost.type}" — costs are keyed by type per event`,
        event
      );
    }
    seenTypes.add(cost.type);
  }

  const totalShare = event.contributorRefs.reduce(
    (sum, ref) => sum + (ref.shareBasisPoints ?? 0),
    0
  );
  if (totalShare > 10000) {
    throw new EventValidationError(
      `Source-supplied shares total ${totalShare} basis points, which exceeds 100%`,
      event
    );
  }
}

/**
 * Build the reversal of an existing event.
 *
 * Negates the gross and every cost, and carries the same contributor refs, so
 * the rules engine re-runs the identical calculation against negated inputs and
 * produces allocations that are the exact negation of the originals. This is why
 * `applyBasisPoints` must be symmetric across zero — if it rounded −0.5 and +0.5
 * differently, a full refund would leave a stray cent on the ledger forever.
 */
export function buildReversal(
  original: RevenueEvent,
  options: { sourceEventId: string; occurredAt: Date }
): RevenueEvent {
  return {
    ...original,
    sourceEventId: options.sourceEventId,
    direction: "reversal",
    reversesSourceEventId: original.sourceEventId,
    occurredAt: options.occurredAt,
    grossAmountMinor: -original.grossAmountMinor,
    costs: original.costs.map((cost) => ({
      ...cost,
      amountMinor: -cost.amountMinor,
    })),
  };
}

/**
 * Net for an event, given which cost types a rule deducts.
 *
 * Costs not named in `deductTypes` are the tenant's own overhead and do not
 * reduce what a contributor is paid on. This is the knob that lets one tenant
 * pass shipping through to contributors and another absorb it, without either
 * needing a schema change or a code path of their own.
 */
export function netForDeductions(
  grossAmountMinor: bigint,
  costs: CostInput[],
  deductTypes: string[]
): { netMinor: bigint; deductedMinor: bigint } {
  const deductible = new Set(deductTypes);
  const deductedMinor = costs
    .filter((cost) => deductible.has(cost.type))
    .reduce((sum, cost) => sum + cost.amountMinor, 0n);

  return {
    netMinor: grossAmountMinor - deductedMinor,
    deductedMinor,
  };
}
