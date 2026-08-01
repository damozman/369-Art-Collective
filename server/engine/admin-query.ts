/**
 * Reads for the admin screens.
 *
 * All read-only and all tenant-scoped. Nothing here recomputes an amount —
 * every figure is summed from what was recorded at the time, same discipline as
 * statements. An admin dashboard that recalculates would let the owner and the
 * contributor see different numbers for the same sale, which is worse than
 * showing nothing.
 */

import { and, count, desc, eq, inArray, sql } from "drizzle-orm";

import * as schema from "@shared/engine-schema";
import type { EngineDb } from "./ingest";

export interface AdminOverview {
  currency: string;
  /** Gross revenue recorded, all time. */
  grossMinor: bigint;
  /** Total the tenant owes contributors, all time, net of reversals. */
  allocatedMinor: bigint;
  /** Total already sent out. */
  paidOutMinor: bigint;
  /** Currently owed but not yet paid — the tenant's liability. */
  outstandingMinor: bigint;
  /** Of the outstanding, the part still inside the refund hold window. */
  heldMinor: bigint;
  /** Of the outstanding, the part that could be paid right now. */
  payableNowMinor: bigint;

  eventCount: number;
  /** Sales the engine could not resolve. Nobody has been paid for these. */
  needsReviewCount: number;
  contributorCount: number;
  /** Contributors carrying a negative balance after a clawback. */
  negativeBalanceCount: number;
  failedPayoutCount: number;
}

export async function getOverview(
  db: EngineDb,
  tenantId: string,
  asOf: Date
): Promise<AdminOverview> {
  const [tenant] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .limit(1);

  if (!tenant) throw new Error(`Unknown tenant ${tenantId}`);

  const [gross] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${schema.revenueEvents.grossAmountMinor}), 0)`,
      events: count(),
    })
    .from(schema.revenueEvents)
    .where(eq(schema.revenueEvents.tenantId, tenantId));

  const [review] = await db
    .select({ n: count() })
    .from(schema.revenueEvents)
    .where(
      and(
        eq(schema.revenueEvents.tenantId, tenantId),
        eq(schema.revenueEvents.needsReview, true)
      )
    );

  // Ledger, split by entry type. One pass rather than several queries.
  const ledgerRows = await db
    .select({
      entryType: schema.ledgerEntries.entryType,
      total: sql<string>`COALESCE(SUM(${schema.ledgerEntries.amountMinor}), 0)`,
    })
    .from(schema.ledgerEntries)
    .where(eq(schema.ledgerEntries.tenantId, tenantId))
    .groupBy(schema.ledgerEntries.entryType);

  const byType = new Map<string, bigint>(
    ledgerRows.map((r) => [r.entryType as string, BigInt(r.total)])
  );
  const sumOf = (...types: string[]) =>
    types.reduce((total, t) => total + (byType.get(t) ?? 0n), 0n);

  const allocatedMinor = sumOf("allocation", "reversal", "adjustment");
  const paidOutMinor = sumOf("payout", "payout_reversal");
  const outstandingMinor = allocatedMinor + paidOutMinor;

  // Per-contributor balances, so held/payable respect the floor-at-zero rule
  // individually. Summing across contributors first would let one person's
  // deficit cancel another's credit, which is not how payouts work.
  const perContributor = await db
    .select({
      contributorId: schema.ledgerEntries.contributorId,
      balance: sql<string>`COALESCE(SUM(${schema.ledgerEntries.amountMinor}), 0)`,
      available: sql<string>`COALESCE(SUM(
        CASE WHEN ${schema.ledgerEntries.amountMinor} < 0
               OR ${schema.ledgerEntries.availableAt} IS NULL
               OR ${schema.ledgerEntries.availableAt} <= ${asOf}
             THEN ${schema.ledgerEntries.amountMinor} ELSE 0 END
      ), 0)`,
    })
    .from(schema.ledgerEntries)
    .where(eq(schema.ledgerEntries.tenantId, tenantId))
    .groupBy(schema.ledgerEntries.contributorId);

  let payableNowMinor = 0n;
  let heldMinor = 0n;
  let negativeBalanceCount = 0;

  for (const row of perContributor) {
    const balance = BigInt(row.balance);
    const available = BigInt(row.available);
    const payable = available > 0n ? available : 0n;

    payableNowMinor += payable;
    if (balance > payable) heldMinor += balance - payable;
    if (balance < 0n) negativeBalanceCount += 1;
  }

  const [contributors] = await db
    .select({ n: count() })
    .from(schema.contributors)
    .where(eq(schema.contributors.tenantId, tenantId));

  const [failed] = await db
    .select({ n: count() })
    .from(schema.payouts)
    .where(
      and(eq(schema.payouts.tenantId, tenantId), eq(schema.payouts.status, "failed"))
    );

  return {
    currency: tenant.defaultCurrency,
    grossMinor: BigInt(gross?.total ?? "0"),
    allocatedMinor,
    paidOutMinor,
    outstandingMinor,
    heldMinor,
    payableNowMinor,
    eventCount: gross?.events ?? 0,
    needsReviewCount: review?.n ?? 0,
    contributorCount: contributors?.n ?? 0,
    negativeBalanceCount,
    failedPayoutCount: failed?.n ?? 0,
  };
}

export interface AdminContributorRow {
  id: string;
  name: string;
  email: string | null;
  externalRef: string | null;
  active: boolean;
  balanceMinor: bigint;
  payableMinor: bigint;
  hasPayoutAccount: boolean;
  payoutsEnabled: boolean;
  /** Why they would be skipped in a payout run, if they would be. */
  blockedReason: string | null;
}

export async function listContributors(
  db: EngineDb,
  tenantId: string,
  asOf: Date,
  minimumMinor: bigint
): Promise<AdminContributorRow[]> {
  const rows = await db
    .select()
    .from(schema.contributors)
    .where(eq(schema.contributors.tenantId, tenantId))
    .orderBy(schema.contributors.name);

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);

  const balances = await db
    .select({
      contributorId: schema.ledgerEntries.contributorId,
      balance: sql<string>`COALESCE(SUM(${schema.ledgerEntries.amountMinor}), 0)`,
      available: sql<string>`COALESCE(SUM(
        CASE WHEN ${schema.ledgerEntries.amountMinor} < 0
               OR ${schema.ledgerEntries.availableAt} IS NULL
               OR ${schema.ledgerEntries.availableAt} <= ${asOf}
             THEN ${schema.ledgerEntries.amountMinor} ELSE 0 END
      ), 0)`,
    })
    .from(schema.ledgerEntries)
    .where(
      and(
        eq(schema.ledgerEntries.tenantId, tenantId),
        inArray(schema.ledgerEntries.contributorId, ids)
      )
    )
    .groupBy(schema.ledgerEntries.contributorId);

  const identities = await db
    .select()
    .from(schema.contributorIdentities)
    .where(inArray(schema.contributorIdentities.contributorId, ids));

  const balanceById = new Map(balances.map((b) => [b.contributorId, b]));
  const identityById = new Map(identities.map((i) => [i.contributorId, i]));

  return rows.map((row) => {
    const balanceRow = balanceById.get(row.id);
    const balanceMinor = BigInt(balanceRow?.balance ?? "0");
    const available = BigInt(balanceRow?.available ?? "0");
    const payableMinor = available > 0n ? available : 0n;
    const identity = identityById.get(row.id);

    // Mirrors the payout batch's own skip logic, so what an admin sees here is
    // what a run will actually do.
    let blockedReason: string | null = null;
    if (!row.active) blockedReason = "Contributor is inactive";
    else if (row.deletedAt) blockedReason = "Contributor is deleted";
    else if (!identity?.stripeAccountId) blockedReason = "No payout account connected";
    else if (!identity.stripePayoutsEnabled) blockedReason = "Payouts not enabled on their account";
    else if (payableMinor <= 0n)
      blockedReason = balanceMinor < 0n ? "Negative balance — recouping" : "Nothing payable yet";
    else if (payableMinor < minimumMinor) blockedReason = "Below the payout minimum";

    return {
      id: row.id,
      name: row.name,
      email: row.email,
      externalRef: row.externalRef,
      active: row.active,
      balanceMinor,
      payableMinor,
      hasPayoutAccount: Boolean(identity?.stripeAccountId),
      payoutsEnabled: Boolean(identity?.stripePayoutsEnabled),
      blockedReason,
    };
  });
}

export interface AdminReviewRow {
  id: string;
  source: string;
  sourceEventId: string;
  occurredAt: Date;
  grossMinor: bigint;
  currency: string;
  reviewReason: string | null;
  workRef: string | null;
  /**
   * What the sale's costs currently are. Carried so the review screen can show
   * an item held for a missing fee alongside the costs that *were* read — an
   * owner about to type in a fee needs to see whether one is already there, and
   * what the rest of the line looks like.
   */
  costs: Array<{ type: string; amountMinor: bigint; source: string | null }>;
}

/** Sales the engine refused to pay on. The owner's action queue. */
export async function listNeedsReview(
  db: EngineDb,
  tenantId: string
): Promise<AdminReviewRow[]> {
  const rows = await db
    .select()
    .from(schema.revenueEvents)
    .where(
      and(
        eq(schema.revenueEvents.tenantId, tenantId),
        eq(schema.revenueEvents.needsReview, true)
      )
    )
    .orderBy(desc(schema.revenueEvents.occurredAt))
    .limit(200);

  if (rows.length === 0) return [];

  // One query for every item's costs rather than one per item.
  const costs = await db
    .select()
    .from(schema.costComponents)
    .where(
      and(
        eq(schema.costComponents.tenantId, tenantId),
        inArray(
          schema.costComponents.revenueEventId,
          rows.map((row) => row.id)
        )
      )
    );

  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    sourceEventId: row.sourceEventId,
    occurredAt: row.occurredAt,
    grossMinor: BigInt(row.grossAmountMinor),
    currency: row.currency,
    reviewReason: row.reviewReason,
    workRef: row.workRef,
    costs: costs
      .filter((cost) => cost.revenueEventId === row.id)
      .map((cost) => ({
        type: cost.type,
        amountMinor: BigInt(cost.amountMinor),
        source: cost.source,
      })),
  }));
}

export interface AdminRuleRow {
  id: string;
  ruleKey: string;
  version: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  scope: string;
  scopeRef: string | null;
  contributorName: string | null;
  basis: string;
  method: string;
  valueBasisPoints: number | null;
  valueMinor: bigint | null;
  costDeductions: string[];
  priority: number;
  active: boolean;
  /** Plain-language rendering, so an owner can check a rule without decoding it. */
  description: string;
}

export async function listRules(
  db: EngineDb,
  tenantId: string
): Promise<AdminRuleRow[]> {
  const rows = await db
    .select({
      rule: schema.splitRules,
      contributorName: schema.contributors.name,
    })
    .from(schema.splitRules)
    .leftJoin(
      schema.contributors,
      eq(schema.splitRules.contributorId, schema.contributors.id)
    )
    .where(eq(schema.splitRules.tenantId, tenantId))
    .orderBy(desc(schema.splitRules.priority), schema.splitRules.ruleKey);

  return rows.map(({ rule, contributorName }) => ({
    id: rule.id,
    ruleKey: rule.ruleKey,
    version: rule.version,
    effectiveFrom: rule.effectiveFrom,
    effectiveTo: rule.effectiveTo,
    scope: rule.scope,
    scopeRef: rule.scopeRef,
    contributorName,
    basis: rule.basis,
    method: rule.method,
    valueBasisPoints: rule.valueBasisPoints,
    valueMinor: rule.valueMinor === null ? null : BigInt(rule.valueMinor),
    costDeductions: rule.costDeductions ?? [],
    priority: rule.priority,
    active: rule.active,
    description: describeRule(rule),
  }));
}

/**
 * Turn a rule row into a sentence an owner can check at a glance.
 *
 * Worth the effort: a rule table full of `basis: net, method: percent,
 * value_basis_points: 3000` is unreadable to the person whose money it is, and
 * an unreadable rule is one nobody notices is wrong.
 */
function describeRule(rule: typeof schema.splitRules.$inferSelect): string {
  const deductions = rule.costDeductions ?? [];

  const amount = (() => {
    switch (rule.method) {
      case "percent":
        return `${(rule.valueBasisPoints ?? 0) / 100}%`;
      case "tiered":
        return "a tiered rate";
      case "flat_per_unit":
        return `$${(Number(rule.valueMinor ?? 0) / 100).toFixed(2)} per item`;
      case "flat_per_event":
        return `$${(Number(rule.valueMinor ?? 0) / 100).toFixed(2)} per sale`;
      default:
        return rule.method;
    }
  })();

  const basis =
    rule.method === "flat_per_unit" || rule.method === "flat_per_event"
      ? ""
      : rule.basis === "net"
        ? deductions.length > 0
          ? ` of profit (after ${deductions.join(", ")})`
          : " of profit"
        : rule.basis === "gross"
          ? " of the sale price"
          : " per unit";

  const who =
    rule.scope === "tenant"
      ? "Everyone"
      : rule.scope === "contributor"
        ? "One contributor"
        : rule.scope === "work"
          ? "One work"
          : `Products of type "${rule.scopeRef}"`;

  const until = rule.effectiveTo
    ? ` until ${rule.effectiveTo.toISOString().slice(0, 10)}`
    : "";

  return `${who} earns ${amount}${basis}, from ${rule.effectiveFrom
    .toISOString()
    .slice(0, 10)}${until}.`;
}

export interface AdminWorkRow {
  id: string;
  title: string;
  externalRef: string | null;
  productType: string | null;
  archivedAt: Date | null;
  contributors: Array<{ id: string; name: string; role: string | null }>;
}

/** Works and who is attached to each — the attribution map, in effect. */
export async function listWorks(
  db: EngineDb,
  tenantId: string
): Promise<AdminWorkRow[]> {
  const works = await db
    .select()
    .from(schema.works)
    .where(eq(schema.works.tenantId, tenantId))
    .orderBy(schema.works.title);

  if (works.length === 0) return [];

  const links = await db
    .select({
      workId: schema.workContributors.workId,
      contributorId: schema.workContributors.contributorId,
      role: schema.workContributors.role,
      name: schema.contributors.name,
    })
    .from(schema.workContributors)
    .innerJoin(
      schema.contributors,
      eq(schema.workContributors.contributorId, schema.contributors.id)
    )
    .where(eq(schema.workContributors.tenantId, tenantId));

  return works.map((work) => ({
    id: work.id,
    title: work.title,
    externalRef: work.externalRef,
    productType: work.productType,
    archivedAt: work.archivedAt,
    contributors: links
      .filter((l) => l.workId === work.id)
      .map((l) => ({ id: l.contributorId, name: l.name, role: l.role })),
  }));
}

export interface AdminSettings {
  payoutHoldDays: number;
  minimumPayoutMinor: string;
  clawbackPolicy: string;
  /** Whole percent, converted back from basis points for display. */
  reservePercent: number;
  reserveReleaseDays: number;
  currency: string;
  /**
   * Whether payouts can actually be instructed. Read from the tenant row rather
   * than from the environment, because it is per-tenant: the platform can have
   * Stripe configured while this particular business has not connected theirs.
   */
  stripeConnected: boolean;
}

export async function getSettings(
  db: EngineDb,
  tenantId: string
): Promise<AdminSettings> {
  const [row] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .limit(1);

  if (!row) throw new Error("Tenant not found");

  return {
    payoutHoldDays: row.payoutHoldDays,
    minimumPayoutMinor: row.minimumPayoutMinor.toString(),
    clawbackPolicy: row.clawbackPolicy,
    reservePercent: row.reserveBasisPoints / 100,
    reserveReleaseDays: row.reserveReleaseDays,
    currency: row.defaultCurrency,
    stripeConnected: Boolean(row.stripeAccountId),
  };
}

export interface AdminBatchRow {
  id: string;
  status: string;
  availableAsOf: Date;
  currency: string;
  completedAt: Date | null;
  createdAt: Date;
  payoutCount: number;
  paidCount: number;
  failedCount: number;
  totalPaidMinor: bigint;
}

export async function listPayoutBatches(
  db: EngineDb,
  tenantId: string
): Promise<AdminBatchRow[]> {
  const batches = await db
    .select()
    .from(schema.payoutBatches)
    .where(eq(schema.payoutBatches.tenantId, tenantId))
    .orderBy(desc(schema.payoutBatches.createdAt))
    .limit(50);

  if (batches.length === 0) return [];

  const payouts = await db
    .select()
    .from(schema.payouts)
    .where(
      and(
        eq(schema.payouts.tenantId, tenantId),
        inArray(
          schema.payouts.batchId,
          batches.map((b) => b.id)
        )
      )
    );

  return batches.map((batch) => {
    const mine = payouts.filter((p) => p.batchId === batch.id);
    const paid = mine.filter((p) => p.status === "paid");

    return {
      id: batch.id,
      status: batch.status,
      availableAsOf: batch.availableAsOf,
      currency: batch.currency,
      completedAt: batch.completedAt,
      createdAt: batch.createdAt,
      payoutCount: mine.length,
      paidCount: paid.length,
      failedCount: mine.filter((p) => p.status === "failed").length,
      totalPaidMinor: paid.reduce((sum, p) => sum + BigInt(p.amountMinor), 0n),
    };
  });
}
