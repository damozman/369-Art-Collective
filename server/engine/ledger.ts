/**
 * The ledger (§5 #4).
 *
 * Append-only. Entries are never updated and never deleted. A contributor's
 * balance is a SUM over their entries, computed on demand — there is no balance
 * column anywhere in the engine schema, and adding one would be a regression,
 * not an optimisation.
 *
 * The marketplace demonstrates why. `artists.monthlySales` is a stored column
 * that drives royalty tiers, and it can drift from the sales that produced it;
 * the marketplace's own `influencers` table carries a comment saying balances
 * are "calculated via queries, not stored to prevent drift". The engine applies
 * that universally.
 *
 * SIGNS. Positive increases what the contributor is owed:
 *
 *   allocation          +   earned from a sale
 *   reversal            −   a refund reversed an earlier allocation
 *   adjustment          ±   manual correction, bonus, or clawback recoupment
 *   payout              −   money left for the contributor
 *   payout_reversal     +   a failed payout returned the balance
 *   advance_recoupment  −   earnings applied against an advance already paid (§10b)
 *
 * `advance_recoupment` is negative for the same reason `payout` is: in both cases
 * the contributor no longer has the money. The difference is only where it went —
 * out to their bank, or against a debt they already collected on. Keeping it a
 * distinct type rather than an `adjustment` is what makes "how much of this
 * advance is left?" a sum over an indexed column instead of a guess from a note.
 *
 * Balances may legally go negative. A refund on a sale whose royalty has already
 * been paid out leaves the contributor in deficit until future earnings recoup
 * it (§8), and a model that forbids that has to do something dishonest instead.
 */

import { sumMinor } from "./money";

export type LedgerEntryType =
  | "allocation"
  | "reversal"
  | "adjustment"
  | "payout"
  | "payout_reversal"
  | "advance_recoupment";

/** An entry as the engine reasons about it, with bigints already converted. */
export interface LedgerEntryInput {
  tenantId: string;
  contributorId: string;
  entryType: LedgerEntryType;
  /** Signed. Positive increases what the contributor is owed. */
  amountMinor: bigint;
  currency: string;
  allocationId?: string | null;
  payoutId?: string | null;
  adjustmentId?: string | null;
  /** Set on `advance_recoupment` entries — which advance this paid down. */
  advanceId?: string | null;
  /** When this becomes payable. Null means immediately. */
  availableAt?: Date | null;
  description?: string | null;
  occurredAt: Date;
}

export interface LedgerEntryRecord extends LedgerEntryInput {
  id: string;
}

export class LedgerError extends Error {}

/**
 * Validate an entry before it is appended.
 *
 * An append-only store has no undo, so the checks that matter have to happen
 * here. A zero-amount entry is rejected because it is always a symptom —
 * either a rounding bug or a rule that should not have matched — and letting it
 * through turns a loud failure into a silent one.
 */
export function validateEntry(entry: LedgerEntryInput): void {
  if (!entry.tenantId) throw new LedgerError("Ledger entry has no tenantId");
  if (!entry.contributorId) throw new LedgerError("Ledger entry has no contributorId");
  if (!entry.currency) throw new LedgerError("Ledger entry has no currency");

  if (entry.amountMinor === 0n) {
    throw new LedgerError(
      `Refusing to append a zero-amount ${entry.entryType} entry — ` +
        "a zero allocation means a rule matched that should not have, or a rounding bug"
    );
  }

  const expectedSign: Partial<Record<LedgerEntryType, "positive" | "negative">> = {
    allocation: "positive",
    reversal: "negative",
    payout: "negative",
    payout_reversal: "positive",
    advance_recoupment: "negative",
    // adjustments are legitimately either sign
  };

  const required = expectedSign[entry.entryType];
  if (required === "positive" && entry.amountMinor < 0n) {
    throw new LedgerError(
      `A ${entry.entryType} entry must be positive, got ${entry.amountMinor}`
    );
  }
  if (required === "negative" && entry.amountMinor > 0n) {
    throw new LedgerError(
      `A ${entry.entryType} entry must be negative, got ${entry.amountMinor}`
    );
  }
}

/**
 * Derive a contributor's balance from their entries.
 *
 * Deliberately takes entries rather than querying, so the arithmetic is testable
 * without a database and so callers cannot accidentally derive a balance from a
 * partially-filtered set.
 */
export function deriveBalance(entries: LedgerEntryInput[]): bigint {
  return sumMinor(entries.map((entry) => entry.amountMinor));
}

/**
 * The amount actually payable right now.
 *
 * Two things reduce it below the raw balance:
 *
 *   1. **Holds.** Entries whose `availableAt` is in the future are earned but
 *      not yet payable (§5 #13, §8) — the refund window has not closed.
 *   2. **Negative balance.** If a contributor is in deficit, nothing is payable
 *      until earnings bring them back above zero.
 *
 * Note the asymmetry: held *credits* are excluded, but every debit counts
 * immediately. Otherwise a contributor with a fresh clawback and a held
 * allocation could be paid money they no longer have.
 */
export function derivePayable(entries: LedgerEntryInput[], asOf: Date): bigint {
  const available = entries.filter((entry) => {
    if (entry.amountMinor < 0n) return true; // debits always count
    return !entry.availableAt || entry.availableAt <= asOf;
  });

  const payable = sumMinor(available.map((entry) => entry.amountMinor));
  return payable > 0n ? payable : 0n;
}

/** Balance as of an instant — for reconstructing a historical statement. */
export function deriveBalanceAsOf(entries: LedgerEntryInput[], asOf: Date): bigint {
  return sumMinor(
    entries.filter((entry) => entry.occurredAt <= asOf).map((entry) => entry.amountMinor)
  );
}

/** When an allocation becomes payable, given the tenant's hold period. */
export function holdUntil(occurredAt: Date, payoutHoldDays: number): Date {
  const available = new Date(occurredAt.getTime());
  available.setUTCDate(available.getUTCDate() + payoutHoldDays);
  return available;
}

/**
 * Turn computed allocations into ledger entries.
 *
 * Allocations and their reversals both come through here: a reversal carries a
 * negative amount and lands as a `reversal` entry. The hold applies only to
 * credits — clawing money back is never delayed, because the whole point of a
 * clawback is that the money should not have been there.
 */
export function entriesForAllocations(
  allocations: Array<{
    id: string;
    contributorId: string;
    amountMinor: bigint;
    currency: string;
    explanation?: string | null;
  }>,
  options: {
    tenantId: string;
    occurredAt: Date;
    payoutHoldDays: number;
    isReversal: boolean;
  }
): LedgerEntryInput[] {
  return allocations
    .filter((allocation) => allocation.amountMinor !== 0n)
    .map((allocation) => ({
      tenantId: options.tenantId,
      contributorId: allocation.contributorId,
      entryType: options.isReversal ? ("reversal" as const) : ("allocation" as const),
      amountMinor: allocation.amountMinor,
      currency: allocation.currency,
      allocationId: allocation.id,
      availableAt: options.isReversal
        ? null
        : holdUntil(options.occurredAt, options.payoutHoldDays),
      description: allocation.explanation ?? null,
      occurredAt: options.occurredAt,
    }));
}

/**
 * Check that the ledger reconciles against what was allocated.
 *
 * Runs as an invariant in tests and can be run as an operational audit: the sum
 * of allocation and reversal entries must equal the sum of the allocations
 * themselves. If it ever does not, an entry was written or dropped outside the
 * intended path, and every downstream number is suspect.
 */
export function reconcile(
  entries: LedgerEntryInput[],
  allocationTotalMinor: bigint
): { reconciled: boolean; ledgerTotalMinor: bigint; differenceMinor: bigint } {
  const ledgerTotalMinor = sumMinor(
    entries
      .filter((e) => e.entryType === "allocation" || e.entryType === "reversal")
      .map((e) => e.amountMinor)
  );

  return {
    reconciled: ledgerTotalMinor === allocationTotalMinor,
    ledgerTotalMinor,
    differenceMinor: ledgerTotalMinor - allocationTotalMinor,
  };
}
