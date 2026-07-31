/**
 * Fetching the rows a statement is assembled from.
 *
 * Split from `statement.ts` so the assembly logic stays pure and testable
 * without a database — the same split as `rules.ts` versus `ingest.ts`.
 *
 * Every join here is read-only and every query is tenant-scoped. There is no
 * code path in this file that recomputes an amount; it reads what was recorded
 * and hands it to the assembler.
 */

import { and, asc, eq, gte, lt, lte } from "drizzle-orm";

import * as schema from "@shared/engine-schema";
import type { EngineDb } from "./ingest";
import {
  buildStatement,
  type Statement,
  type StatementSourceRow,
} from "./statement";

/**
 * Build a contributor's statement for a period.
 *
 * `asOf` defaults to `periodEnd` rather than to now, so regenerating a past
 * statement reproduces it exactly — including which lines were held at the time.
 * Passing `new Date()` would make last quarter's statement change every time it
 * was viewed.
 */
export async function getStatement(
  db: EngineDb,
  options: {
    tenantId: string;
    contributorId: string;
    periodStart: Date;
    periodEnd: Date;
    asOf?: Date;
  }
): Promise<Statement> {
  const [tenant] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, options.tenantId))
    .limit(1);

  if (!tenant) throw new Error(`Unknown tenant ${options.tenantId}`);

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
    throw new Error(`Unknown contributor ${options.contributorId} in tenant ${options.tenantId}`);
  }

  // Opening balance: everything strictly before the period. Amounts only —
  // the rest of the row is irrelevant to a running total.
  const priorRows = await db
    .select({ amountMinor: schema.ledgerEntries.amountMinor })
    .from(schema.ledgerEntries)
    .where(
      and(
        eq(schema.ledgerEntries.tenantId, options.tenantId),
        eq(schema.ledgerEntries.contributorId, options.contributorId),
        lt(schema.ledgerEntries.occurredAt, options.periodStart)
      )
    );

  // Ledger entries in the period, joined to the allocation that produced them
  // (left join — payouts and manual adjustments have no allocation) and on to
  // the event and work for context.
  const rows = await db
    .select({
      occurredAt: schema.ledgerEntries.occurredAt,
      entryType: schema.ledgerEntries.entryType,
      amountMinor: schema.ledgerEntries.amountMinor,
      currency: schema.ledgerEntries.currency,
      availableAt: schema.ledgerEntries.availableAt,
      description: schema.ledgerEntries.description,

      allocationExplanation: schema.allocations.explanation,
      allocationTrace: schema.allocations.trace,
      ruleKey: schema.allocations.ruleKey,
      ruleVersion: schema.allocations.ruleVersion,

      workTitle: schema.works.title,
      sourceEventId: schema.revenueEvents.sourceEventId,
    })
    .from(schema.ledgerEntries)
    .leftJoin(
      schema.allocations,
      eq(schema.ledgerEntries.allocationId, schema.allocations.id)
    )
    .leftJoin(
      schema.revenueEvents,
      eq(schema.allocations.revenueEventId, schema.revenueEvents.id)
    )
    .leftJoin(schema.works, eq(schema.revenueEvents.workId, schema.works.id))
    .where(
      and(
        eq(schema.ledgerEntries.tenantId, options.tenantId),
        eq(schema.ledgerEntries.contributorId, options.contributorId),
        gte(schema.ledgerEntries.occurredAt, options.periodStart),
        lte(schema.ledgerEntries.occurredAt, options.periodEnd)
      )
    )
    .orderBy(asc(schema.ledgerEntries.occurredAt));

  const sourceRows: StatementSourceRow[] = rows.map((row) => ({
    occurredAt: row.occurredAt,
    entryType: row.entryType,
    amountMinor: BigInt(row.amountMinor),
    currency: row.currency,
    availableAt: row.availableAt,
    description: row.description,
    allocationExplanation: row.allocationExplanation,
    allocationTrace: row.allocationTrace,
    ruleKey: row.ruleKey,
    ruleVersion: row.ruleVersion,
    workTitle: row.workTitle,
    sourceEventId: row.sourceEventId,
  }));

  return buildStatement({
    contributorId: options.contributorId,
    contributorName: contributor.name,
    tenantName: tenant.name,
    currency: tenant.defaultCurrency,
    periodStart: options.periodStart,
    periodEnd: options.periodEnd,
    asOf: options.asOf ?? options.periodEnd,
    priorRows: priorRows.map((r) => ({ amountMinor: BigInt(r.amountMinor) })),
    rows: sourceRows,
  });
}

/** A contributor's payout history — what actually left, and what failed. */
export async function getPayoutHistory(
  db: EngineDb,
  tenantId: string,
  contributorId: string
): Promise<
  Array<{
    id: string;
    status: string;
    amountMinor: bigint;
    currency: string;
    reserveHeldMinor: bigint;
    transferId: string | null;
    failureReason: string | null;
    completedAt: Date | null;
    createdAt: Date;
  }>
> {
  const rows = await db
    .select()
    .from(schema.payouts)
    .where(
      and(
        eq(schema.payouts.tenantId, tenantId),
        eq(schema.payouts.contributorId, contributorId)
      )
    )
    .orderBy(asc(schema.payouts.createdAt));

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    amountMinor: BigInt(row.amountMinor),
    currency: row.currency,
    reserveHeldMinor: BigInt(row.reserveHeldMinor),
    transferId: row.stripeTransferId,
    failureReason: row.failureReason,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
  }));
}
