/**
 * Recoupable advances (§10b).
 *
 * The one structure blueprint §6 could not express as a split rule. An advance is
 * money paid to a contributor before they earned it, recovered out of what they
 * earn afterwards. It is not a percentage, a flat amount or a tier — it is a
 * balance that sits between the allocation and the payout, which is precisely
 * what §10b said would need a new table and a payout-time step rather than a
 * change to the rules engine. That is what this is.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SEVEN DECISIONS. Each one is a place a reimplementation would go wrong.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 1. **An advance is not a negative ledger balance.**
 *    The obvious implementation is to write a negative ledger entry when the
 *    advance is paid and let `derivePayable`'s floor-at-zero do the work. It is
 *    wrong for exactly one reason, and it is fatal: a negative balance can only
 *    express *100%* recoupment. Real advance clauses very often recoup at less —
 *    "we take half of everything you earn until it's clear" — specifically so the
 *    contributor keeps seeing money and does not walk away. A rate below 100
 *    cannot be represented by a deficit, so the recoupable balance has to live
 *    beside the ledger balance rather than inside it.
 *
 * 2. **Recoupment is capped at the HIGHEST rate among the contributor's open
 *    advances, and applied oldest-first within that cap.**
 *    With one advance — the overwhelmingly common case — this is just "the rate".
 *    With several at different rates it is a genuine ambiguity that only a real
 *    contract can settle, and the alternatives are worse: summing the rates lets
 *    two 60% advances take 120% of a payment, and taking the *lowest* rate
 *    silently overrides the stricter of two contracts the tenant themselves
 *    agreed to. Highest-rate-wins honours the strictest clause and can never
 *    exceed 100%. **This is the one place in the feature where a design partner's
 *    actual paperwork should be checked against what we built** — see §10b and
 *    ratified decision #10.
 *
 * 3. **Recoupment applies to what is PAYABLE, not to what was earned.**
 *    Held earnings — money inside the refund window — are not touched. Recouping
 *    against money that may yet be refunded means unwinding the recoupment when it
 *    is, and an advance balance that moves backwards is exactly the kind of number
 *    that generates support tickets. The advance recoups a beat later instead.
 *
 * 4. **Recoupment happens for every contributor with a positive payable balance
 *    in a run, INCLUDING the ones who cannot be transferred to.**
 *    This looks wrong at first glance and is deliberate. If recoupment only
 *    happened alongside a successful transfer, a contributor whose entire payable
 *    amount is being recouped would never be paid, would therefore never have a
 *    reason to connect a bank, and their advance would never recoup — permanently.
 *    Settling a debt out of earnings is bookkeeping; it does not depend on whether
 *    the person has finished onboarding. Contributors marked deleted are the one
 *    exception.
 *
 * 5. **Recoupment runs BEFORE the reserve is withheld.**
 *    Reserve is withheld-but-still-theirs; recoupment permanently settles a debt.
 *    Reserving first would withhold money, leave the advance outstanding, and then
 *    recoup the same money on a later run — the same amount recouped, later, for
 *    no reason.
 *
 * 6. **A reversal never restores an advance balance.**
 *    If earnings that were recouped are later refunded, the contributor's ledger
 *    goes negative and future earnings recover it through §8's existing clawback
 *    path. The advance stays recouped. Un-recouping would mean a paid-down advance
 *    can grow again, and "you owe more than you did last month, and nobody paid
 *    you anything" is not defensible on a statement.
 *
 * 7. **Nothing here stores how much is left.**
 *    Outstanding is `amountMinor` minus the sum of the advance's own
 *    `advance_recoupment` ledger entries. Those entries *are* the recoupment
 *    record — there is no second table — because a second place to record it is a
 *    second place for it to disagree with the ledger. Same rule as everywhere
 *    else in this engine: never store a balance, derive it.
 */

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import * as schema from "@shared/engine-schema";
import type { EngineDb } from "./ingest";
import { applyBasisPoints, formatMoney } from "./money";

export class AdvanceError extends Error {}

export type AdvanceStatus = "open" | "written_off" | "cancelled";

// ============================================================
// The pure arithmetic
// ============================================================

/**
 * An open advance, reduced to only what the recoupment maths needs. Deliberately
 * not the database row: the planner is pure so it can be tested exhaustively
 * without a database, in the same spirit as `rules.ts`.
 */
export interface RecoupableAdvance {
  id: string;
  amountMinor: bigint;
  recoupedMinor: bigint;
  recoupmentBasisPoints: number;
  currency: string;
  /** Oldest first. Ties broken by id so the plan is deterministic. */
  issuedAt: Date;
}

export interface RecoupmentApplication {
  advanceId: string;
  amountMinor: bigint;
  /** Outstanding after this application, for the explanation on the entry. */
  remainingMinor: bigint;
}

export interface RecoupmentPlan {
  totalMinor: bigint;
  applications: RecoupmentApplication[];
  /** What actually transfers after recoupment. Never negative. */
  netPayableMinor: bigint;
}

export function outstandingMinor(advance: RecoupableAdvance): bigint {
  const left = advance.amountMinor - advance.recoupedMinor;
  return left > 0n ? left : 0n;
}

/**
 * Work out how much of a payable balance goes to recouping advances.
 *
 * Pure, clock-free, and total: given the same inputs it always produces the same
 * plan, including the order of applications. The caller writes the ledger.
 */
export function planRecoupment(
  payableMinor: bigint,
  advances: RecoupableAdvance[]
): RecoupmentPlan {
  const empty: RecoupmentPlan = {
    totalMinor: 0n,
    applications: [],
    netPayableMinor: payableMinor > 0n ? payableMinor : 0n,
  };

  if (payableMinor <= 0n) return empty;

  const outstanding = advances
    .filter((advance) => outstandingMinor(advance) > 0n)
    .sort((a, b) => {
      const byDate = a.issuedAt.getTime() - b.issuedAt.getTime();
      return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
    });

  if (outstanding.length === 0) return empty;

  // Decision 2. The cap is one rate applied once, not a rate per advance —
  // otherwise two advances at 60% would between them take 120% of a payment.
  const cappingRate = outstanding.reduce(
    (highest, advance) => Math.max(highest, advance.recoupmentBasisPoints),
    0
  );

  let remaining = applyBasisPoints(payableMinor, cappingRate);
  if (remaining > payableMinor) remaining = payableMinor; // belt and braces
  if (remaining <= 0n) return empty;

  const applications: RecoupmentApplication[] = [];
  let total = 0n;

  for (const advance of outstanding) {
    if (remaining <= 0n) break;

    const left = outstandingMinor(advance);
    const take = left < remaining ? left : remaining;
    if (take <= 0n) continue;

    applications.push({
      advanceId: advance.id,
      amountMinor: take,
      remainingMinor: left - take,
    });
    total += take;
    remaining -= take;
  }

  return {
    totalMinor: total,
    applications,
    netPayableMinor: payableMinor - total,
  };
}

/**
 * Validate an advance before it is recorded.
 *
 * Recorded here rather than at the route so the rules hold for the seeder, the
 * importer and anything else that ever creates one.
 */
export function validateAdvance(input: {
  amountMinor: bigint;
  recoupmentBasisPoints: number;
  currency: string;
}): void {
  if (input.amountMinor <= 0n) {
    throw new AdvanceError(
      "An advance must be a positive amount. Money owed the other way is a clawback, not an advance."
    );
  }
  if (!Number.isInteger(input.recoupmentBasisPoints)) {
    throw new AdvanceError("Recoupment rate must be a whole number of basis points");
  }
  if (input.recoupmentBasisPoints <= 0) {
    // Decision 3 in the schema comment: a zero-rate advance never recoups. It is
    // a gift, and the honest way to record a gift is a write-off, which leaves a
    // reason and an actor behind.
    throw new AdvanceError(
      "Recoupment rate must be above zero. An advance that recoups nothing is a payment, not an advance — record it and write it off if that is what you mean."
    );
  }
  if (input.recoupmentBasisPoints > 10000) {
    throw new AdvanceError(
      "Recoupment rate cannot exceed 100% — an advance cannot take more than the person earned."
    );
  }
  if (!input.currency) {
    throw new AdvanceError("An advance must carry a currency");
  }
}

// ============================================================
// The database-facing part
// ============================================================

export interface AdvanceSummary {
  id: string;
  contributorId: string;
  contributorName: string;
  amountMinor: bigint;
  recoupedMinor: bigint;
  outstandingMinor: bigint;
  recoupmentBasisPoints: number;
  currency: string;
  status: AdvanceStatus;
  workId: string | null;
  workTitle: string | null;
  issuedAt: Date;
  note: string | null;
  closedAt: Date | null;
  closeNote: string | null;
}

/**
 * How much has been recouped against each of the given advances.
 *
 * Summed in Postgres rather than in JS: the alternative reads every recoupment
 * entry across the tenant's history to add up a handful of numbers.
 */
async function recoupedByAdvance(
  db: EngineDb,
  advanceIds: string[]
): Promise<Map<string, bigint>> {
  if (advanceIds.length === 0) return new Map();

  const rows = await db
    .select({
      advanceId: schema.ledgerEntries.advanceId,
      // Recoupment entries are negative; the advance is paid down by their
      // magnitude, so negate the sum here rather than at every call site.
      recouped: sql<string>`COALESCE(-SUM(${schema.ledgerEntries.amountMinor}), 0)`,
    })
    .from(schema.ledgerEntries)
    .where(
      and(
        inArray(schema.ledgerEntries.advanceId, advanceIds),
        eq(schema.ledgerEntries.entryType, "advance_recoupment")
      )
    )
    .groupBy(schema.ledgerEntries.advanceId);

  return new Map(
    rows.filter((row) => row.advanceId).map((row) => [row.advanceId!, BigInt(row.recouped)])
  );
}

/** Every open advance for a set of contributors, ready for `planRecoupment`. */
export async function loadOpenAdvances(
  db: EngineDb,
  tenantId: string,
  contributorIds: string[]
): Promise<Map<string, RecoupableAdvance[]>> {
  const byContributor = new Map<string, RecoupableAdvance[]>();
  if (contributorIds.length === 0) return byContributor;

  const rows = await db
    .select()
    .from(schema.advances)
    .where(
      and(
        eq(schema.advances.tenantId, tenantId),
        eq(schema.advances.status, "open"),
        inArray(schema.advances.contributorId, contributorIds)
      )
    );

  if (rows.length === 0) return byContributor;

  const recouped = await recoupedByAdvance(
    db,
    rows.map((row) => row.id)
  );

  for (const row of rows) {
    const advance: RecoupableAdvance = {
      id: row.id,
      amountMinor: BigInt(row.amountMinor),
      recoupedMinor: recouped.get(row.id) ?? 0n,
      recoupmentBasisPoints: row.recoupmentBasisPoints,
      currency: row.currency,
      issuedAt: row.issuedAt,
    };

    const existing = byContributor.get(row.contributorId);
    if (existing) existing.push(advance);
    else byContributor.set(row.contributorId, [advance]);
  }

  return byContributor;
}

/** Total outstanding across a contributor's open advances. For the portal. */
export async function outstandingForContributor(
  db: EngineDb,
  tenantId: string,
  contributorId: string
): Promise<{ outstandingMinor: bigint; currency: string | null; count: number }> {
  const byContributor = await loadOpenAdvances(db, tenantId, [contributorId]);
  const advances = byContributor.get(contributorId) ?? [];

  let total = 0n;
  for (const advance of advances) total += outstandingMinor(advance);

  return {
    outstandingMinor: total,
    currency: advances[0]?.currency ?? null,
    count: advances.filter((advance) => outstandingMinor(advance) > 0n).length,
  };
}

export async function listAdvances(
  db: EngineDb,
  tenantId: string,
  options: { contributorId?: string; includeClosed?: boolean } = {}
): Promise<AdvanceSummary[]> {
  const conditions = [eq(schema.advances.tenantId, tenantId)];
  if (options.contributorId) {
    conditions.push(eq(schema.advances.contributorId, options.contributorId));
  }
  if (!options.includeClosed) {
    conditions.push(eq(schema.advances.status, "open"));
  }

  const rows = await db
    .select({
      advance: schema.advances,
      contributorName: schema.contributors.name,
      workTitle: schema.works.title,
    })
    .from(schema.advances)
    .innerJoin(
      schema.contributors,
      eq(schema.contributors.id, schema.advances.contributorId)
    )
    .leftJoin(schema.works, eq(schema.works.id, schema.advances.workId))
    .where(and(...conditions))
    .orderBy(sql`${schema.advances.issuedAt} DESC`);

  const recouped = await recoupedByAdvance(
    db,
    rows.map((row) => row.advance.id)
  );

  return rows.map(({ advance, contributorName, workTitle }) => {
    const amountMinor = BigInt(advance.amountMinor);
    const recoupedMinor = recouped.get(advance.id) ?? 0n;
    const left = amountMinor - recoupedMinor;

    return {
      id: advance.id,
      contributorId: advance.contributorId,
      contributorName,
      amountMinor,
      recoupedMinor,
      outstandingMinor: left > 0n ? left : 0n,
      recoupmentBasisPoints: advance.recoupmentBasisPoints,
      currency: advance.currency,
      status: advance.status as AdvanceStatus,
      workId: advance.workId,
      workTitle: workTitle ?? null,
      issuedAt: advance.issuedAt,
      note: advance.note,
      closedAt: advance.closedAt,
      closeNote: advance.closeNote,
    };
  });
}

/**
 * Record an advance.
 *
 * Note what this does NOT do: it does not transfer anything, and it writes no
 * ledger entry. The money left the tenant's account by whatever means they
 * normally use; this records the debt so it recoups. Decision 1 in the header.
 *
 * Tenancy is checked explicitly on both the contributor and the work. A
 * `tenantId` on the row being inserted proves nothing about the ids inside it —
 * the same lesson `linkWorkContributor` taught the expensive way.
 */
export async function createAdvance(
  db: EngineDb,
  input: {
    tenantId: string;
    contributorId: string;
    amountMinor: bigint;
    currency: string;
    recoupmentBasisPoints: number;
    issuedAt: Date;
    workId?: string | null;
    note?: string | null;
    createdBy?: string | null;
  }
): Promise<AdvanceSummary> {
  validateAdvance(input);

  const [contributor] = await db
    .select()
    .from(schema.contributors)
    .where(
      and(
        eq(schema.contributors.id, input.contributorId),
        eq(schema.contributors.tenantId, input.tenantId)
      )
    )
    .limit(1);

  if (!contributor) {
    throw new AdvanceError("Unknown contributor");
  }
  if (contributor.deletedAt) {
    throw new AdvanceError("That person has been removed. Restore them before recording an advance.");
  }

  if (input.workId) {
    const [work] = await db
      .select({ id: schema.works.id })
      .from(schema.works)
      .where(
        and(eq(schema.works.id, input.workId), eq(schema.works.tenantId, input.tenantId))
      )
      .limit(1);

    if (!work) throw new AdvanceError("Unknown work");
  }

  const [row] = await db
    .insert(schema.advances)
    .values({
      tenantId: input.tenantId,
      contributorId: input.contributorId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      recoupmentBasisPoints: input.recoupmentBasisPoints,
      workId: input.workId ?? null,
      issuedAt: input.issuedAt,
      note: input.note ?? null,
      createdBy: input.createdBy ?? null,
    })
    .returning({ id: schema.advances.id });

  const [summary] = await listAdvances(db, input.tenantId, {
    contributorId: input.contributorId,
    includeClosed: true,
  }).then((all) => all.filter((advance) => advance.id === row.id));

  return summary;
}

/**
 * Stop an advance recouping.
 *
 * `cancelled` means it was recorded in error and no money ever left — legal only
 * while nothing has been recouped, for the same reason `recordEventCost` refuses
 * once anything has been allocated. Once earnings have been applied against it,
 * "this never happened" is a claim the ledger contradicts, and the way to undo
 * settled money is a correction that leaves a trail, not an edit that removes one.
 *
 * `written_off` means the money did leave and is not coming back. Legal at any
 * time, and one-way: forgiving a debt and then reinstating it is a conversation
 * with the contributor, not a button in a console.
 */
export async function closeAdvance(
  db: EngineDb,
  input: {
    tenantId: string;
    advanceId: string;
    status: "written_off" | "cancelled";
    note?: string | null;
    closedBy?: string | null;
  }
): Promise<AdvanceSummary> {
  const [advance] = await db
    .select()
    .from(schema.advances)
    .where(
      and(
        eq(schema.advances.id, input.advanceId),
        eq(schema.advances.tenantId, input.tenantId)
      )
    )
    .limit(1);

  if (!advance) throw new AdvanceError("Unknown advance");
  if (advance.status !== "open") {
    throw new AdvanceError(
      `This advance is already ${advance.status === "written_off" ? "written off" : "cancelled"}.`
    );
  }

  if (input.status === "cancelled") {
    const recouped = await recoupedByAdvance(db, [input.advanceId]);
    const already = recouped.get(input.advanceId) ?? 0n;
    if (already > 0n) {
      throw new AdvanceError(
        `${formatMoney(already, advance.currency)} has already been recouped against this advance, ` +
          "so it cannot be cancelled as never-happened. Write it off instead — that records " +
          "that the rest is being forgiven, and leaves the recoupment history intact."
      );
    }
  }

  await db
    .update(schema.advances)
    .set({
      status: input.status,
      closedAt: new Date(),
      closedBy: input.closedBy ?? null,
      closeNote: input.note ?? null,
    })
    .where(eq(schema.advances.id, input.advanceId));

  const all = await listAdvances(db, input.tenantId, { includeClosed: true });
  return all.find((row) => row.id === input.advanceId)!;
}

/**
 * Advances issued inside a calendar year, per contributor.
 *
 * For the year-end report. An advance is money the contributor received in the
 * year it was paid, exactly like a payout — the cash-basis rule the whole tax
 * report is built on. Recoupment is NOT a repayment for tax purposes and does not
 * reduce a later year; it reduces what they are paid, and that reduced payout is
 * what that later year reports.
 */
export async function advancesIssuedInYear(
  db: EngineDb,
  tenantId: string,
  from: Date,
  to: Date
): Promise<Array<{ contributorId: string; currency: string; totalMinor: bigint }>> {
  const rows = await db
    .select({
      contributorId: schema.advances.contributorId,
      currency: schema.advances.currency,
      total: sql<string>`COALESCE(SUM(${schema.advances.amountMinor}), 0)`,
    })
    .from(schema.advances)
    .where(
      and(
        eq(schema.advances.tenantId, tenantId),
        // A cancelled advance never happened, so it is not income. A written-off
        // one very much did — the person kept the money.
        sql`${schema.advances.status} <> 'cancelled'`,
        sql`${schema.advances.issuedAt} >= ${from}`,
        sql`${schema.advances.issuedAt} < ${to}`
      )
    )
    .groupBy(schema.advances.contributorId, schema.advances.currency);

  return rows.map((row) => ({
    contributorId: row.contributorId,
    currency: row.currency,
    totalMinor: BigInt(row.total),
  }));
}
