/**
 * Resolving the things that need a human.
 *
 * Two kinds of item end up in the review queue, and they need different answers:
 *
 * 1. **A sale nobody could be matched to.** The incoming reference matched no
 *    contributor, so the engine recorded the revenue and paid nobody. Resolving
 *    it means saying who it belongs to and letting the normal calculation run.
 *
 * 2. **A refund that could not be recovered.** Money was already paid out when
 *    the chargeback landed, leaving the contributor in deficit. There is nothing
 *    to "fix" — the money is gone. Resolving it means either acknowledging that
 *    it will recoup from future earnings, or writing it off.
 *
 * THE RULE THAT GOVERNS ALL OF THIS: resolving a held sale runs the *same*
 * allocation path ingestion would have run, against the event's own date. A
 * three-month-old sale resolved today pays what applied three months ago, not
 * today's rate. Anything else would make "when did you get round to fixing it"
 * a factor in what somebody earns.
 */

import { and, eq } from "drizzle-orm";

import * as schema from "@shared/engine-schema";
import { AdminValidationError } from "./admin-mutations";
import { allocateEvent, type EngineDb } from "./ingest";
import { formatMoney } from "./money";
import {
  RECORDABLE_COST_TYPES,
  type RecordableCostType,
  type RevenueEvent,
} from "./revenue-event";

/** Rebuild the canonical event from what was stored, so rules see what ingestion saw. */
async function loadEventForAllocation(
  db: EngineDb,
  tenantId: string,
  eventId: string
): Promise<{ row: typeof schema.revenueEvents.$inferSelect; event: RevenueEvent }> {
  const [row] = await db
    .select()
    .from(schema.revenueEvents)
    .where(
      and(
        eq(schema.revenueEvents.id, eventId),
        eq(schema.revenueEvents.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!row) throw new AdminValidationError("That item is not in this business");

  const costs = await db
    .select()
    .from(schema.costComponents)
    .where(eq(schema.costComponents.revenueEventId, eventId));

  return {
    row,
    event: {
      tenantId: row.tenantId,
      source: row.source,
      sourceEventId: row.sourceEventId,
      direction: row.direction,
      occurredAt: row.occurredAt,
      grossAmountMinor: BigInt(row.grossAmountMinor),
      currency: row.currency,
      quantity: row.quantity,
      workRef: row.workRef ?? undefined,
      contributorRefs: [],
      costs: costs.map((cost) => ({
        type: cost.type,
        amountMinor: BigInt(cost.amountMinor),
        currency: cost.currency,
        source: cost.source ?? undefined,
      })),
    },
  };
}

export interface ResolveResult {
  status: "resolved" | "still_unresolved";
  allocationIds: string[];
  totalAllocatedMinor: bigint;
  warnings: string[];
}

/**
 * Say who a held sale belongs to, and pay it.
 *
 * Refuses if the event already has allocations — that would mean it was not
 * actually stuck, and allocating again would pay twice.
 */
export async function resolveEventContributor(
  db: EngineDb,
  options: {
    tenantId: string;
    eventId: string;
    contributorId: string;
    role?: string | null;
    /** Also remember this mapping, so the next sale resolves by itself. */
    rememberReference?: boolean;
    actorId?: string;
  }
): Promise<ResolveResult> {
  const { row, event } = await loadEventForAllocation(
    db,
    options.tenantId,
    options.eventId
  );

  if (!row.needsReview) {
    throw new AdminValidationError("That item has already been dealt with");
  }

  const existing = await db
    .select({ id: schema.allocations.id })
    .from(schema.allocations)
    .where(eq(schema.allocations.revenueEventId, options.eventId))
    .limit(1);

  if (existing.length > 0) {
    throw new AdminValidationError(
      "That sale has already been paid out. Nothing further to do."
    );
  }

  const [contributor] = await db
    .select()
    .from(schema.contributors)
    .where(
      and(
        eq(schema.contributors.id, options.contributorId),
        eq(schema.contributors.tenantId, options.tenantId)
      )
    )
    .limit(1);

  if (!contributor) {
    throw new AdminValidationError("That person is not in this business");
  }

  const [tenant] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, options.tenantId))
    .limit(1);

  // Same path ingestion uses, against the event's own date.
  const allocated = await allocateEvent(db, {
    eventId: options.eventId,
    event,
    workId: row.workId,
    contributors: [{ contributorId: options.contributorId, role: options.role ?? undefined }],
    payoutHoldDays: tenant!.payoutHoldDays,
  });

  if (allocated.allocationIds.length === 0) {
    return {
      status: "still_unresolved",
      allocationIds: [],
      totalAllocatedMinor: 0n,
      warnings: allocated.warnings,
    };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(schema.revenueEvents)
      .set({ needsReview: false, reviewReason: null })
      .where(eq(schema.revenueEvents.id, options.eventId));

    // Teaching the system the mapping is what stops the same problem recurring
    // every time this artist sells something.
    if (options.rememberReference && row.workRef && !contributor.externalRef) {
      await tx
        .update(schema.contributors)
        .set({ externalRef: row.workRef })
        .where(eq(schema.contributors.id, options.contributorId));
    }

    await tx.insert(schema.auditLog).values({
      tenantId: options.tenantId,
      actorType: "tenant_user",
      actorId: options.actorId ?? null,
      action: "resolve_review",
      entityType: "revenue_event",
      entityId: options.eventId,
      after: {
        contributorId: options.contributorId,
        allocated: allocated.totalAllocatedMinor.toString(),
      },
    });
  });

  return {
    status: "resolved",
    allocationIds: allocated.allocationIds,
    totalAllocatedMinor: allocated.totalAllocatedMinor,
    warnings: allocated.warnings,
  };
}

/**
 * Acknowledge an item without paying anything.
 *
 * For refunds that cannot be recovered, and for sales that genuinely belong to
 * nobody. The event stays exactly as recorded — only the flag clears — so the
 * revenue and the reason remain in the history.
 */
export async function dismissReview(
  db: EngineDb,
  options: { tenantId: string; eventId: string; note: string; actorId?: string }
): Promise<void> {
  if (!options.note || options.note.trim().length < 3) {
    // A dismissal with no reason is indistinguishable later from a mistake.
    throw new AdminValidationError("Say why you are dismissing this");
  }

  const [row] = await db
    .select()
    .from(schema.revenueEvents)
    .where(
      and(
        eq(schema.revenueEvents.id, options.eventId),
        eq(schema.revenueEvents.tenantId, options.tenantId)
      )
    )
    .limit(1);

  if (!row) throw new AdminValidationError("That item is not in this business");
  if (!row.needsReview) throw new AdminValidationError("That item has already been dealt with");

  await db.transaction(async (tx) => {
    await tx
      .update(schema.revenueEvents)
      .set({
        needsReview: false,
        reviewReason: `Dismissed: ${options.note.trim()} (was: ${row.reviewReason ?? "no reason recorded"})`,
      })
      .where(eq(schema.revenueEvents.id, options.eventId));

    await tx.insert(schema.auditLog).values({
      tenantId: options.tenantId,
      actorType: "tenant_user",
      actorId: options.actorId ?? null,
      action: "dismiss_review",
      entityType: "revenue_event",
      entityId: options.eventId,
      before: { reviewReason: row.reviewReason },
      after: { note: options.note.trim() },
    });
  });
}

/**
 * The closed list of cost types, re-exported from where it now lives.
 *
 * It moved to `revenue-event.ts` when the CSV importer needed it: that module
 * is pure, and the mapper that validates a tenant's cost columns must not have
 * to import this DB-facing file — and therefore Drizzle and the whole schema —
 * to find out which spellings are legal. The list constrains `CostInput.type`,
 * so sitting beside that interface is where it always belonged.
 *
 * Re-exported rather than relocated-and-rewired so every existing importer of
 * `./review` keeps working; there is exactly one definition either way.
 */
export {
  RECORDABLE_COST_TYPES,
  type RecordableCostType,
} from "./revenue-event";

/**
 * Record a cost that the sales channel could not tell us.
 *
 * WHY THIS EXISTS. The Shopify adapter refuses to guess a payment fee: if the
 * gateway does not report one, the line is held rather than allocated against an
 * invented number (see `adapters/shopify/map.ts`). That was the right call, but
 * it left a gap — the only way out of such a hold was to resolve it, which
 * allocated with *no* fee at all and quietly made the business absorb it. The
 * hold reason said so, so it was a visible choice rather than a hidden one, but
 * "visible" is not the same as "fixable". This is the fix: type in what the fee
 * actually was, from the statement, and then resolve normally.
 *
 * THE TWO GUARDS, both load-bearing:
 *
 * 1. **Nothing may be allocated yet.** An allocation snapshots the numbers it
 *    was computed from (§5 #6). Adding a cost afterwards would leave the event
 *    saying one thing and the payment saying another, with no way to tell which
 *    was right. Once money has been worked out, the way to change it is a
 *    reversal, not an edit.
 * 2. **The item must still be held.** Same reason — a resolved item has been
 *    through the allocator.
 *
 * Correcting a cost that is already recorded IS allowed, because both guards
 * still apply: nothing has been paid from it yet. A mistyped fee that cannot be
 * corrected before allocation would be worse than one that can.
 */
export async function recordEventCost(
  db: EngineDb,
  options: {
    tenantId: string;
    eventId: string;
    type: RecordableCostType;
    amountMinor: bigint;
    note?: string | null;
    actorId?: string;
  }
): Promise<void> {
  if (!RECORDABLE_COST_TYPES.includes(options.type)) {
    throw new AdminValidationError("That is not a cost the system recognises");
  }

  // Negative would be revenue wearing a cost's clothing, and would inflate what
  // everyone is paid. Zero is meaningless — "no fee" is the absence of a row.
  if (options.amountMinor <= 0n) {
    throw new AdminValidationError("A cost has to be a positive amount");
  }

  const [row] = await db
    .select()
    .from(schema.revenueEvents)
    .where(
      and(
        eq(schema.revenueEvents.id, options.eventId),
        eq(schema.revenueEvents.tenantId, options.tenantId)
      )
    )
    .limit(1);

  if (!row) throw new AdminValidationError("That item is not in this business");

  if (!row.needsReview) {
    throw new AdminValidationError(
      "That sale has already been dealt with. Costs can only be added while it is still held."
    );
  }

  const allocated = await db
    .select({ id: schema.allocations.id })
    .from(schema.allocations)
    .where(eq(schema.allocations.revenueEventId, options.eventId))
    .limit(1);

  if (allocated.length > 0) {
    throw new AdminValidationError(
      "That sale has already been paid out, so its costs can no longer be changed."
    );
  }

  if (options.amountMinor > BigInt(row.grossAmountMinor)) {
    // Not forbidden by the engine — a loss-making line is real, and allocations
    // floor at zero rather than going negative. But it is much more often a
    // decimal point in the wrong place, so it is worth stopping.
    throw new AdminValidationError(
      `That is more than the sale itself (${formatMoney(
        BigInt(row.grossAmountMinor),
        row.currency
      )}). Check the amount.`
    );
  }

  const [existing] = await db
    .select()
    .from(schema.costComponents)
    .where(
      and(
        eq(schema.costComponents.revenueEventId, options.eventId),
        eq(schema.costComponents.type, options.type)
      )
    )
    .limit(1);

  const source = options.note?.trim()
    ? `manual: ${options.note.trim()}`
    : "manual";

  await db.transaction(async (tx) => {
    if (existing) {
      await tx
        .update(schema.costComponents)
        .set({
          amountMinor: options.amountMinor,
          source,
          resolvedAt: new Date(),
        })
        .where(eq(schema.costComponents.id, existing.id));
    } else {
      await tx.insert(schema.costComponents).values({
        tenantId: options.tenantId,
        revenueEventId: options.eventId,
        type: options.type,
        amountMinor: options.amountMinor,
        currency: row.currency,
        source,
        resolvedAt: new Date(),
      });
    }

    await tx.insert(schema.auditLog).values({
      tenantId: options.tenantId,
      actorType: "tenant_user",
      actorId: options.actorId ?? null,
      action: "record_cost",
      entityType: "revenue_event",
      entityId: options.eventId,
      before: existing
        ? { type: existing.type, amountMinor: existing.amountMinor.toString() }
        : null,
      after: {
        type: options.type,
        amountMinor: options.amountMinor.toString(),
        note: options.note?.trim() ?? null,
      },
    });
  });
}

/**
 * Clear a contributor's negative balance by absorbing it.
 *
 * Used when a chargeback left somebody in deficit and the tenant decides not to
 * chase it. Written as an *adjustment* — a new, positive ledger entry — rather
 * than by deleting the reversal. The loss stays visible in the history, which is
 * the whole point of an append-only ledger.
 */
export async function writeOffDeficit(
  db: EngineDb,
  options: {
    tenantId: string;
    contributorId: string;
    amountMinor: bigint;
    note: string;
    actorId?: string;
  }
): Promise<string> {
  if (options.amountMinor <= 0n) {
    throw new AdminValidationError("A write-off has to be a positive amount");
  }
  if (!options.note || options.note.trim().length < 3) {
    throw new AdminValidationError("Say why you are writing this off");
  }

  const [contributor] = await db
    .select()
    .from(schema.contributors)
    .where(
      and(
        eq(schema.contributors.id, options.contributorId),
        eq(schema.contributors.tenantId, options.tenantId)
      )
    )
    .limit(1);

  if (!contributor) throw new AdminValidationError("That person is not in this business");

  const [tenant] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, options.tenantId))
    .limit(1);

  return db.transaction(async (tx) => {
    const [adjustment] = await tx
      .insert(schema.adjustments)
      .values({
        tenantId: options.tenantId,
        contributorId: options.contributorId,
        reason: "write_off",
        amountMinor: options.amountMinor,
        currency: tenant!.defaultCurrency,
        note: options.note.trim(),
        createdBy: options.actorId ?? null,
      })
      .returning({ id: schema.adjustments.id });

    await tx.insert(schema.ledgerEntries).values({
      tenantId: options.tenantId,
      contributorId: options.contributorId,
      entryType: "adjustment",
      amountMinor: options.amountMinor,
      currency: tenant!.defaultCurrency,
      adjustmentId: adjustment.id,
      availableAt: null,
      description: `Written off ${formatMoney(options.amountMinor, tenant!.defaultCurrency)}: ${options.note.trim()}`,
      occurredAt: new Date(),
    });

    await tx.insert(schema.auditLog).values({
      tenantId: options.tenantId,
      actorType: "tenant_user",
      actorId: options.actorId ?? null,
      action: "write_off",
      entityType: "contributor",
      entityId: options.contributorId,
      after: { amountMinor: options.amountMinor.toString(), note: options.note.trim() },
    });

    return adjustment.id;
  });
}
