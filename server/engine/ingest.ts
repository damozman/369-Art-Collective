/**
 * Ingestion — the path from a canonical RevenueEvent to money on the ledger.
 *
 * This is where the pure pieces meet the database. Everything upstream of it
 * (`rules.ts`, `ledger.ts`, `reversal.ts`) is deliberately pure and clock-free;
 * this module supplies the persistence and the transaction boundary.
 *
 * THREE PROPERTIES THIS FILE IS RESPONSIBLE FOR:
 *
 * 1. **Idempotency comes from the database, not from a pre-check.** We attempt
 *    the insert and catch the unique violation. A "does it exist?" query
 *    followed by an insert is a race, and two concurrent webhook deliveries hit
 *    it routinely — which is exactly how the marketplace ended up processing
 *    every order twice.
 *
 * 2. **Everything for one event lands in one transaction.** An event whose
 *    allocations were written but whose ledger entries were not is worse than
 *    an event that was never ingested, because it looks complete.
 *
 * 3. **Trailing volume is derived, never read from a column.** Tiered rules
 *    need a contributor's running total; it is computed by summing the ledger
 *    (§5 #4). The marketplace's `artists.monthlySales` is the stored-balance
 *    version of this and is a known drift risk.
 */

import { and, eq, gte, inArray, lt, lte, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "@shared/engine-schema";
import { entriesForAllocations, validateEntry, type LedgerEntryInput } from "./ledger";
import {
  applyClawbackPolicy,
  buildReversingAllocations,
  needsReview as reversalNeedsReview,
  type ClawbackPolicy,
  type ReversibleAllocation,
} from "./reversal";
import {
  evaluate,
  type EvaluableRule,
  type RuleContext,
  type TierRung,
} from "./rules";
import { validateRevenueEvent, type RevenueEvent } from "./revenue-event";

export type EngineDb = NodePgDatabase<typeof schema>;

/** Postgres unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = "23505";

/**
 * Does this error mean "already ingested"?
 *
 * Walks the `cause` chain rather than checking the top-level error, because
 * Drizzle wraps driver errors in `DrizzleQueryError` and the SQLSTATE lives on
 * the wrapped pg error underneath. Checking only the top level looks correct,
 * type-checks, and silently turns every replayed webhook into a 500 — which is
 * exactly what it did until a real Postgres run caught it.
 */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    if (
      typeof current === "object" &&
      (current as { code?: string }).code === UNIQUE_VIOLATION
    ) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export interface IngestResult {
  status: "ingested" | "duplicate" | "needs_review";
  eventId?: string;
  allocationIds: string[];
  totalAllocatedMinor: bigint;
  warnings: string[];
  reviewReason?: string;
}

/**
 * A contributor's trailing volume, derived from the ledger.
 *
 * Sums allocation and reversal entries — so a refunded sale correctly stops
 * counting toward the tier it helped earn. A stored counter would keep the
 * contributor on the higher rung indefinitely.
 */
export async function deriveTrailingVolume(
  db: EngineDb,
  tenantId: string,
  contributorId: string,
  since: Date,
  until: Date
): Promise<bigint> {
  const [row] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${schema.ledgerEntries.amountMinor}), 0)`,
    })
    .from(schema.ledgerEntries)
    .where(
      and(
        eq(schema.ledgerEntries.tenantId, tenantId),
        eq(schema.ledgerEntries.contributorId, contributorId),
        inArray(schema.ledgerEntries.entryType, ["allocation", "reversal"]),
        gte(schema.ledgerEntries.occurredAt, since),
        lt(schema.ledgerEntries.occurredAt, until)
      )
    );

  return BigInt(row?.total ?? "0");
}

/** Load the rules that could apply to an event at its `occurredAt`. */
export async function loadApplicableRules(
  db: EngineDb,
  tenantId: string,
  occurredAt: Date
): Promise<EvaluableRule[]> {
  const rows = await db
    .select()
    .from(schema.splitRules)
    .where(
      and(
        eq(schema.splitRules.tenantId, tenantId),
        eq(schema.splitRules.active, true),
        lte(schema.splitRules.effectiveFrom, occurredAt),
        or(
          sql`${schema.splitRules.effectiveTo} IS NULL`,
          sql`${schema.splitRules.effectiveTo} > ${occurredAt}`
        )
      )
    );

  return rows.map((row) => ({
    id: row.id,
    ruleKey: row.ruleKey,
    version: row.version,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    scope: row.scope,
    scopeRef: row.scopeRef,
    contributorId: row.contributorId,
    role: row.role,
    basis: row.basis,
    method: row.method,
    valueBasisPoints: row.valueBasisPoints,
    valueMinor: row.valueMinor === null ? null : BigInt(row.valueMinor),
    tierTable: normalizeTierTable(row.tierTable),
    costDeductions: row.costDeductions ?? [],
    priority: row.priority,
    currency: row.currency,
    active: row.active,
  }));
}

/** Tier tables come out of jsonb with string amounts; convert to bigint. */
function normalizeTierTable(raw: unknown): TierRung[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.map((rung: any) => ({
    minMinor: BigInt(rung.minMinor ?? rung.min_minor ?? 0),
    basisPoints: Number(rung.basisPoints ?? rung.basis_points ?? 0),
  }));
}

/**
 * Resolve an event's work and contributor references against the tenant's data.
 *
 * An unresolvable reference does NOT fall back to a default contributor or a
 * guessed work. It marks the event for review, exactly as the marketplace's
 * cost resolver holds a line rather than inventing a cost — an unpaid event
 * held for review can be fixed; a payout to the wrong person cannot.
 */
export async function resolveReferences(
  db: EngineDb,
  event: RevenueEvent
): Promise<{
  workId: string | null;
  contributors: RuleContext["contributors"];
  needsReview: boolean;
  reviewReason?: string;
}> {
  let workId: string | null = null;

  if (event.workRef) {
    const [work] = await db
      .select()
      .from(schema.works)
      .where(
        and(
          eq(schema.works.tenantId, event.tenantId),
          eq(schema.works.externalRef, event.workRef)
        )
      )
      .limit(1);
    workId = work?.id ?? null;
  }

  const refs = event.contributorRefs.map((r) => r.ref);
  const rows = refs.length
    ? await db
        .select()
        .from(schema.contributors)
        .where(
          and(
            eq(schema.contributors.tenantId, event.tenantId),
            inArray(schema.contributors.externalRef, refs)
          )
        )
    : [];

  const byRef = new Map(rows.map((row) => [row.externalRef, row]));

  const contributors: RuleContext["contributors"] = [];
  const unresolved: string[] = [];

  for (const ref of event.contributorRefs) {
    const row = byRef.get(ref.ref);
    if (!row) {
      unresolved.push(ref.ref);
      continue;
    }
    contributors.push({
      contributorId: row.id,
      role: ref.role,
      shareBasisPoints: ref.shareBasisPoints,
    });
  }

  if (unresolved.length > 0) {
    return {
      workId,
      contributors,
      needsReview: true,
      reviewReason: `Unresolved contributor reference(s): ${unresolved.join(", ")}`,
    };
  }

  if (contributors.length === 0) {
    return {
      workId,
      contributors,
      needsReview: true,
      reviewReason: "Event has no resolvable contributors",
    };
  }

  return { workId, contributors, needsReview: false };
}

/**
 * Ingest one canonical event.
 *
 * Safe to call repeatedly with the same `sourceEventId` — the second call
 * returns `duplicate` without writing anything.
 */
export async function ingestEvent(
  db: EngineDb,
  event: RevenueEvent,
  options: { trailingVolumeWindowDays?: number } = {}
): Promise<IngestResult> {
  validateRevenueEvent(event);

  const [tenant] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, event.tenantId))
    .limit(1);

  if (!tenant) {
    throw new Error(`Unknown tenant ${event.tenantId}`);
  }

  const resolution = await resolveReferences(db, event);

  // Insert the event first, outside the work of calculating. If this throws a
  // unique violation the webhook is a replay and we stop — no allocations, no
  // ledger entries, no double payment.
  let eventId: string;
  try {
    const [row] = await db
      .insert(schema.revenueEvents)
      .values({
        tenantId: event.tenantId,
        source: event.source,
        sourceEventId: event.sourceEventId,
        direction: event.direction,
        occurredAt: event.occurredAt,
        grossAmountMinor: event.grossAmountMinor,
        currency: event.currency,
        quantity: event.quantity,
        workId: resolution.workId,
        workRef: event.workRef ?? null,
        needsReview: resolution.needsReview,
        reviewReason: resolution.reviewReason ?? null,
        metadata: event.metadata ?? null,
      })
      .returning({ id: schema.revenueEvents.id });
    eventId = row.id;
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        status: "duplicate",
        allocationIds: [],
        totalAllocatedMinor: 0n,
        warnings: [
          `Event ${event.source}/${event.sourceEventId} already ingested for tenant ${event.tenantId}`,
        ],
      };
    }
    throw error;
  }

  // Costs are recorded whether or not the event can be allocated — the money
  // was spent regardless, and a held event still needs its costs for review.
  if (event.costs.length > 0) {
    await db.insert(schema.costComponents).values(
      event.costs.map((cost) => ({
        tenantId: event.tenantId,
        revenueEventId: eventId,
        type: cost.type,
        amountMinor: cost.amountMinor,
        currency: cost.currency,
        source: cost.source ?? null,
        resolvedAt: cost.resolvedAt ?? null,
      }))
    );
  }

  if (resolution.needsReview) {
    return {
      status: "needs_review",
      eventId,
      allocationIds: [],
      totalAllocatedMinor: 0n,
      warnings: [],
      reviewReason: resolution.reviewReason,
    };
  }

  // Trailing volume for tiered rules — derived, never stored.
  const windowDays = options.trailingVolumeWindowDays ?? 30;
  const windowStart = new Date(event.occurredAt.getTime());
  windowStart.setUTCDate(windowStart.getUTCDate() - windowDays);

  const contributorsWithVolume: RuleContext["contributors"] = [];
  for (const contributor of resolution.contributors) {
    contributorsWithVolume.push({
      ...contributor,
      trailingVolumeMinor: await deriveTrailingVolume(
        db,
        event.tenantId,
        contributor.contributorId,
        windowStart,
        event.occurredAt
      ),
    });
  }

  const [work] = resolution.workId
    ? await db.select().from(schema.works).where(eq(schema.works.id, resolution.workId)).limit(1)
    : [undefined];

  const rules = await loadApplicableRules(db, event.tenantId, event.occurredAt);

  const result = evaluate(rules, event, {
    tenantId: event.tenantId,
    occurredAt: event.occurredAt,
    workId: resolution.workId,
    productType: work?.productType ?? null,
    contributors: contributorsWithVolume,
  });

  if (result.allocations.length === 0) {
    await db
      .update(schema.revenueEvents)
      .set({
        needsReview: true,
        reviewReason: result.warnings.join("; ") || "No allocations produced",
      })
      .where(eq(schema.revenueEvents.id, eventId));

    return {
      status: "needs_review",
      eventId,
      allocationIds: [],
      totalAllocatedMinor: 0n,
      warnings: result.warnings,
      reviewReason: result.warnings.join("; ") || "No allocations produced",
    };
  }

  const allocationIds: string[] = [];
  let totalAllocatedMinor = 0n;

  // Allocations and their ledger entries land together or not at all.
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(schema.allocations)
      .values(
        result.allocations.map((allocation) => ({
          tenantId: event.tenantId,
          revenueEventId: eventId,
          contributorId: allocation.contributorId,
          splitRuleId: allocation.ruleId,
          ruleKey: allocation.ruleKey,
          ruleVersion: allocation.ruleVersion,
          amountMinor: allocation.amountMinor,
          currency: allocation.currency,
          grossAmountMinor: allocation.grossAmountMinor,
          deductedCostsMinor: allocation.deductedCostsMinor,
          basisAmountMinor: allocation.basisAmountMinor,
          basis: allocation.basis,
          method: allocation.method,
          rateBasisPoints: allocation.rateBasisPoints,
          explanation: allocation.explanation,
          trace: allocation.trace.map((step) => ({
            ...step,
            amountMinor: step.amountMinor?.toString(),
          })),
        }))
      )
      .returning({
        id: schema.allocations.id,
        contributorId: schema.allocations.contributorId,
        amountMinor: schema.allocations.amountMinor,
        currency: schema.allocations.currency,
        explanation: schema.allocations.explanation,
      });

    allocationIds.push(...inserted.map((row) => row.id));

    const entries = entriesForAllocations(
      inserted.map((row) => ({
        id: row.id,
        contributorId: row.contributorId,
        amountMinor: BigInt(row.amountMinor),
        currency: row.currency,
        explanation: row.explanation,
      })),
      {
        tenantId: event.tenantId,
        occurredAt: event.occurredAt,
        payoutHoldDays: tenant.payoutHoldDays,
        isReversal: event.direction === "reversal",
      }
    );

    for (const entry of entries) entryGuard(entry);

    if (entries.length > 0) {
      await tx.insert(schema.ledgerEntries).values(entries);
      totalAllocatedMinor = entries.reduce((sum, e) => sum + e.amountMinor, 0n);
    }
  });

  return {
    status: "ingested",
    eventId,
    allocationIds,
    totalAllocatedMinor,
    warnings: result.warnings,
  };
}

/** Validate before appending — an append-only store has no undo. */
function entryGuard(entry: LedgerEntryInput): void {
  validateEntry(entry);
}

export interface ReverseResult {
  status: "reversed" | "duplicate" | "nothing_to_reverse";
  reversalEventId?: string;
  reversedAllocationIds: string[];
  contributorImpactMinor: bigint;
  tenantAbsorbedMinor: bigint;
  needsReview: boolean;
  reviewReasons: string[];
}

/**
 * Reverse a previously-ingested event — a refund or chargeback.
 *
 * Reverses the ORIGINAL allocations by exact negation rather than recomputing
 * from today's rules. If the rate changed between the sale and the refund,
 * recomputing would claw back an amount that was never paid.
 */
export async function reverseEvent(
  db: EngineDb,
  options: {
    tenantId: string;
    originalSourceEventId: string;
    source: RevenueEvent["source"];
    reversalSourceEventId: string;
    occurredAt: Date;
    partialBasisPoints?: number;
    reason?: string;
  }
): Promise<ReverseResult> {
  const [tenant] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, options.tenantId))
    .limit(1);

  if (!tenant) throw new Error(`Unknown tenant ${options.tenantId}`);

  const [originalEvent] = await db
    .select()
    .from(schema.revenueEvents)
    .where(
      and(
        eq(schema.revenueEvents.tenantId, options.tenantId),
        eq(schema.revenueEvents.source, options.source),
        eq(schema.revenueEvents.sourceEventId, options.originalSourceEventId)
      )
    )
    .limit(1);

  if (!originalEvent) {
    throw new Error(
      `Cannot reverse unknown event ${options.source}/${options.originalSourceEventId}`
    );
  }

  const originalAllocations = await db
    .select()
    .from(schema.allocations)
    .where(eq(schema.allocations.revenueEventId, originalEvent.id));

  if (originalAllocations.length === 0) {
    return {
      status: "nothing_to_reverse",
      reversedAllocationIds: [],
      contributorImpactMinor: 0n,
      tenantAbsorbedMinor: 0n,
      needsReview: false,
      reviewReasons: [],
    };
  }

  let reversalEventId: string;
  try {
    const [row] = await db
      .insert(schema.revenueEvents)
      .values({
        tenantId: options.tenantId,
        source: options.source,
        sourceEventId: options.reversalSourceEventId,
        direction: "reversal",
        reversesEventId: originalEvent.id,
        occurredAt: options.occurredAt,
        grossAmountMinor: -BigInt(originalEvent.grossAmountMinor),
        currency: originalEvent.currency,
        quantity: originalEvent.quantity,
        workId: originalEvent.workId,
        workRef: originalEvent.workRef,
        metadata: { reason: options.reason ?? null },
      })
      .returning({ id: schema.revenueEvents.id });
    reversalEventId = row.id;
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        status: "duplicate",
        reversedAllocationIds: [],
        contributorImpactMinor: 0n,
        tenantAbsorbedMinor: 0n,
        needsReview: false,
        reviewReasons: [
          `Reversal ${options.reversalSourceEventId} already processed`,
        ],
      };
    }
    throw error;
  }

  const reversible: ReversibleAllocation[] = originalAllocations.map((row) => ({
    id: row.id,
    contributorId: row.contributorId,
    amountMinor: BigInt(row.amountMinor),
    currency: row.currency,
    ruleId: row.splitRuleId,
    ruleKey: row.ruleKey,
    ruleVersion: row.ruleVersion,
    grossAmountMinor: BigInt(row.grossAmountMinor),
    deductedCostsMinor: BigInt(row.deductedCostsMinor),
    basisAmountMinor: BigInt(row.basisAmountMinor),
    basis: row.basis,
    method: row.method,
    rateBasisPoints: row.rateBasisPoints,
    explanation: row.explanation,
  }));

  const reversals = buildReversingAllocations(reversible, {
    partialBasisPoints: options.partialBasisPoints,
    reason: options.reason,
  });

  // Balances before the clawback, to decide what needs a human.
  const reviewReasons: string[] = [];
  for (const reversal of reversals) {
    const balance = await deriveContributorBalance(
      db,
      options.tenantId,
      reversal.contributorId
    );
    const review = reversalNeedsReview(
      balance,
      reversal.amountMinor,
      tenant.clawbackPolicy as ClawbackPolicy
    );
    if (review.needsReview && review.reason) reviewReasons.push(review.reason);
  }

  const outcome = applyClawbackPolicy(reversals, {
    tenantId: options.tenantId,
    policy: tenant.clawbackPolicy as ClawbackPolicy,
    occurredAt: options.occurredAt,
  });

  const reversedAllocationIds: string[] = [];

  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(schema.allocations)
      .values(
        reversals.map((reversal) => ({
          tenantId: options.tenantId,
          revenueEventId: reversalEventId,
          contributorId: reversal.contributorId,
          splitRuleId: reversal.ruleId,
          ruleKey: reversal.ruleKey,
          ruleVersion: reversal.ruleVersion,
          amountMinor: reversal.amountMinor,
          currency: reversal.currency,
          grossAmountMinor: reversal.grossAmountMinor,
          deductedCostsMinor: reversal.deductedCostsMinor,
          basisAmountMinor: reversal.basisAmountMinor,
          basis: reversal.basis as any,
          method: reversal.method as any,
          rateBasisPoints: reversal.rateBasisPoints,
          explanation: reversal.explanation,
          reversesAllocationId: reversal.reversesAllocationId,
        }))
      )
      .returning({ id: schema.allocations.id });

    reversedAllocationIds.push(...inserted.map((row) => row.id));

    if (outcome.entries.length > 0) {
      const entries = outcome.entries.map((entry, index) => ({
        ...entry,
        allocationId: inserted[index]?.id ?? null,
      }));
      for (const entry of entries) entryGuard(entry);
      await tx.insert(schema.ledgerEntries).values(entries);
    }

    if (reviewReasons.length > 0) {
      await tx
        .update(schema.revenueEvents)
        .set({ needsReview: true, reviewReason: reviewReasons.join("; ") })
        .where(eq(schema.revenueEvents.id, reversalEventId));
    }
  });

  return {
    status: "reversed",
    reversalEventId,
    reversedAllocationIds,
    contributorImpactMinor: outcome.contributorImpactMinor,
    tenantAbsorbedMinor: outcome.tenantAbsorbedMinor,
    needsReview: reviewReasons.length > 0,
    reviewReasons,
  };
}

/** A contributor's balance, summed from the ledger. Never a stored column. */
export async function deriveContributorBalance(
  db: EngineDb,
  tenantId: string,
  contributorId: string
): Promise<bigint> {
  const [row] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${schema.ledgerEntries.amountMinor}), 0)`,
    })
    .from(schema.ledgerEntries)
    .where(
      and(
        eq(schema.ledgerEntries.tenantId, tenantId),
        eq(schema.ledgerEntries.contributorId, contributorId)
      )
    );

  return BigInt(row?.total ?? "0");
}

/** What a contributor can actually be paid right now, respecting holds. */
export async function derivePayableBalance(
  db: EngineDb,
  tenantId: string,
  contributorId: string,
  asOf: Date
): Promise<bigint> {
  const [row] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${schema.ledgerEntries.amountMinor}), 0)`,
    })
    .from(schema.ledgerEntries)
    .where(
      and(
        eq(schema.ledgerEntries.tenantId, tenantId),
        eq(schema.ledgerEntries.contributorId, contributorId),
        // Credits must have matured; debits always count. The asymmetry stops a
        // contributor with a fresh clawback being paid money they no longer have.
        or(
          lt(schema.ledgerEntries.amountMinor, 0n as any),
          sql`${schema.ledgerEntries.availableAt} IS NULL`,
          lte(schema.ledgerEntries.availableAt, asOf)
        )
      )
    );

  const payable = BigInt(row?.total ?? "0");
  return payable > 0n ? payable : 0n;
}
