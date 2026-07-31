/**
 * Contributor statements.
 *
 * §5 #6 calls the stored explanation "the #1 reason a merchant would trust you
 * over their spreadsheet". This is where that pays off: a statement is
 * *assembled* from what was recorded at calculation time, never recomputed.
 *
 * THAT DISTINCTION IS THE WHOLE POINT. Recomputing a statement asks "what would
 * this sale earn under today's rules?" — which is a different question from
 * "what did this contributor actually earn?", and the two diverge the moment a
 * rate changes. The marketplace had exactly this bug: `payout-service.ts`
 * recalculated at payout time and silently overwrote what a contributor had
 * been told. Every number below comes from a stored row.
 *
 * A statement therefore has no rules engine, no rates, and no arithmetic beyond
 * summing amounts that were already decided.
 */

import { formatMoney, sumMinor } from "./money";

export interface StatementLine {
  occurredAt: Date;
  type: "allocation" | "reversal" | "adjustment" | "payout" | "payout_reversal";
  amountMinor: bigint;
  currency: string;

  /** The derivation as it was recorded. Not regenerated. */
  explanation: string | null;
  /** Structured trace for rendering the derivation as steps. */
  trace: unknown;

  /** Which rule version produced it, so a dispute has a specific answer. */
  ruleKey: string | null;
  ruleVersion: number | null;

  workTitle: string | null;
  sourceEventId: string | null;

  /** When it becomes payable. Null means immediately; future means held. */
  availableAt: Date | null;
  /** True when this line is earned but still inside the tenant's hold window. */
  held: boolean;
}

export interface StatementTotals {
  earnedMinor: bigint;
  reversedMinor: bigint;
  adjustmentsMinor: bigint;
  paidOutMinor: bigint;
  /** Everything above, summed. What the contributor is owed overall. */
  closingBalanceMinor: bigint;
  /** The part of the balance that has cleared its hold and can be paid now. */
  payableNowMinor: bigint;
  /** Earned but still within the hold window. */
  heldMinor: bigint;
}

export interface Statement {
  contributorId: string;
  contributorName: string;
  tenantName: string;
  currency: string;

  periodStart: Date;
  periodEnd: Date;

  openingBalanceMinor: bigint;
  lines: StatementLine[];
  totals: StatementTotals;

  /** Plain-language summary, safe to put in an email. */
  summary: string;
}

/** A ledger row joined to whatever produced it. What the assembler consumes. */
export interface StatementSourceRow {
  occurredAt: Date;
  entryType: StatementLine["type"];
  amountMinor: bigint;
  currency: string;
  availableAt: Date | null;
  description: string | null;

  allocationExplanation?: string | null;
  allocationTrace?: unknown;
  ruleKey?: string | null;
  ruleVersion?: number | null;
  workTitle?: string | null;
  sourceEventId?: string | null;
}

/**
 * Assemble a statement for a period.
 *
 * `asOf` decides what counts as held — it is passed in rather than read from a
 * clock so a statement can be reproduced exactly as it appeared on any past
 * date. Regenerating last quarter's statement must not shift its hold column
 * just because time has passed.
 */
export function buildStatement(options: {
  contributorId: string;
  contributorName: string;
  tenantName: string;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
  asOf: Date;
  /** Every ledger row strictly before `periodStart`, for the opening balance. */
  priorRows: Array<{ amountMinor: bigint }>;
  /** Ledger rows within the period, joined to their sources. */
  rows: StatementSourceRow[];
}): Statement {
  const openingBalanceMinor = sumMinor(options.priorRows.map((r) => r.amountMinor));

  const lines: StatementLine[] = options.rows
    .slice()
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
    .map((row) => ({
      occurredAt: row.occurredAt,
      type: row.entryType,
      amountMinor: row.amountMinor,
      currency: row.currency,
      // The stored allocation explanation wins; the ledger description is the
      // fallback for entries with no allocation behind them (payouts,
      // manual adjustments).
      explanation: row.allocationExplanation ?? row.description ?? null,
      trace: row.allocationTrace ?? null,
      ruleKey: row.ruleKey ?? null,
      ruleVersion: row.ruleVersion ?? null,
      workTitle: row.workTitle ?? null,
      sourceEventId: row.sourceEventId ?? null,
      availableAt: row.availableAt,
      held: isHeld(row, options.asOf),
    }));

  const byType = (type: StatementLine["type"]) =>
    sumMinor(lines.filter((l) => l.type === type).map((l) => l.amountMinor));

  const earnedMinor = byType("allocation");
  const reversedMinor = byType("reversal");
  const adjustmentsMinor = byType("adjustment");
  const paidOutMinor = byType("payout") + byType("payout_reversal");

  const periodMovementMinor = sumMinor(lines.map((l) => l.amountMinor));
  const closingBalanceMinor = openingBalanceMinor + periodMovementMinor;

  const heldMinor = sumMinor(lines.filter((l) => l.held).map((l) => l.amountMinor));

  // Payable mirrors the ledger's rule exactly: held credits are excluded,
  // debits always count, and a negative result is not payable.
  const rawPayable = closingBalanceMinor - heldMinor;
  const payableNowMinor = rawPayable > 0n ? rawPayable : 0n;

  const totals: StatementTotals = {
    earnedMinor,
    reversedMinor,
    adjustmentsMinor,
    paidOutMinor,
    closingBalanceMinor,
    payableNowMinor,
    heldMinor,
  };

  return {
    contributorId: options.contributorId,
    contributorName: options.contributorName,
    tenantName: options.tenantName,
    currency: options.currency,
    periodStart: options.periodStart,
    periodEnd: options.periodEnd,
    openingBalanceMinor,
    lines,
    totals,
    summary: buildSummary(options.contributorName, totals, options.currency),
  };
}

function isHeld(row: StatementSourceRow, asOf: Date): boolean {
  // Only credits can be held. A debit is never "not yet applied".
  if (row.amountMinor <= 0n) return false;
  if (!row.availableAt) return false;
  return row.availableAt > asOf;
}

/**
 * A summary a contributor can read without knowing what a ledger is.
 *
 * Deliberately mentions reversals and holds when they are non-zero. A
 * contributor who sees a smaller number than they expected should find the
 * reason in the same sentence, not have to ask.
 */
function buildSummary(name: string, totals: StatementTotals, currency: string): string {
  const parts: string[] = [];

  parts.push(`${name} earned ${formatMoney(totals.earnedMinor, currency)} this period`);

  if (totals.reversedMinor !== 0n) {
    parts.push(
      `less ${formatMoney(-totals.reversedMinor, currency)} reversed from refunds or chargebacks`
    );
  }

  if (totals.adjustmentsMinor !== 0n) {
    parts.push(
      `${totals.adjustmentsMinor > 0n ? "plus" : "less"} ${formatMoney(
        totals.adjustmentsMinor < 0n ? -totals.adjustmentsMinor : totals.adjustmentsMinor,
        currency
      )} in adjustments`
    );
  }

  if (totals.paidOutMinor !== 0n) {
    parts.push(`and was paid ${formatMoney(-totals.paidOutMinor, currency)}`);
  }

  let sentence = `${parts.join(", ")}.`;

  if (totals.closingBalanceMinor < 0n) {
    sentence +=
      ` The closing balance is ${formatMoney(totals.closingBalanceMinor, currency)}, which means` +
      " more was refunded than earned. Nothing is owed back — this is recovered from future earnings.";
  } else {
    sentence += ` Closing balance ${formatMoney(totals.closingBalanceMinor, currency)}.`;

    if (totals.heldMinor > 0n) {
      sentence +=
        ` Of that, ${formatMoney(totals.heldMinor, currency)} is still within the refund` +
        ` window and becomes payable later; ${formatMoney(totals.payableNowMinor, currency)} is available now.`;
    }
  }

  return sentence;
}

/**
 * Render a statement as plain text.
 *
 * Useful for email and for eyeballing the numbers during development. The
 * structured `Statement` is what an API returns; this is a view of it.
 */
export function renderStatementText(statement: Statement): string {
  const lines: string[] = [];
  const money = (amount: bigint) => formatMoney(amount, statement.currency);

  lines.push(`Statement for ${statement.contributorName} — ${statement.tenantName}`);
  lines.push(
    `${statement.periodStart.toISOString().slice(0, 10)} to ${statement.periodEnd
      .toISOString()
      .slice(0, 10)}`
  );
  lines.push("");
  lines.push(`Opening balance: ${money(statement.openingBalanceMinor)}`);
  lines.push("");

  if (statement.lines.length === 0) {
    lines.push("No activity this period.");
  } else {
    for (const line of statement.lines) {
      const date = line.occurredAt.toISOString().slice(0, 10);
      const held = line.held ? "  [held]" : "";
      const work = line.workTitle ? ` — ${line.workTitle}` : "";
      lines.push(`${date}  ${money(line.amountMinor).padStart(12)}  ${line.type}${work}${held}`);
      if (line.explanation) {
        lines.push(`            ${line.explanation}`);
      }
    }
  }

  lines.push("");
  lines.push(`Earned:      ${money(statement.totals.earnedMinor)}`);
  if (statement.totals.reversedMinor !== 0n) {
    lines.push(`Reversed:    ${money(statement.totals.reversedMinor)}`);
  }
  if (statement.totals.adjustmentsMinor !== 0n) {
    lines.push(`Adjustments: ${money(statement.totals.adjustmentsMinor)}`);
  }
  if (statement.totals.paidOutMinor !== 0n) {
    lines.push(`Paid out:    ${money(statement.totals.paidOutMinor)}`);
  }
  lines.push(`Closing:     ${money(statement.totals.closingBalanceMinor)}`);
  if (statement.totals.heldMinor > 0n) {
    lines.push(`  held:      ${money(statement.totals.heldMinor)}`);
    lines.push(`  payable:   ${money(statement.totals.payableNowMinor)}`);
  }
  lines.push("");
  lines.push(statement.summary);

  return lines.join("\n");
}
