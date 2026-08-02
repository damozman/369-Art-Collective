/**
 * CSV → canonical RevenueEvent. PURE — no database, no clock, no I/O.
 *
 * Same split as the Shopify adapter: this file decides what a statement row
 * *means*, and `ingest.ts` decides who it belongs to and writes it. Every money
 * decision is here, where it can be tested exhaustively without a database.
 *
 * READ THIS HEADER BEFORE CHANGING ANY OF THE SIX DECISIONS BELOW. Each one is
 * a place where the tempting behaviour produces a number rather than an error,
 * and a wrong number in a statement import is somebody's income.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 1. NOTHING IS GUESSED. This is the same rule as the cost resolver's refusal
 *    to invent a price and the Shopify mapper's refusal to assume "2.9% + 30¢".
 *    A row this file cannot read exactly becomes a reported error against its
 *    line number, never a best effort. An unimported row can be fixed in the
 *    spreadsheet and imported tomorrow; a royalty paid on a misread column
 *    cannot be, once the money has left.
 *
 * 2. DATES ARE NEVER SNIFFED. `01/02/2026` is 1 February in most of the world
 *    and 2 January in the United States, and there is no evidence in the file
 *    that settles it. The owner picks the format for the file; a row that does
 *    not match the format they picked is an error. Auto-detection would work
 *    perfectly on the first eleven days of every month and then quietly move a
 *    sale into the wrong quarter — which lands in the wrong tax year, and
 *    against the wrong version of a rate.
 *
 * 3. MONEY IS READ FROM THE STRING, never through `Number()`. Currency symbols
 *    and thousands separators are stripped; parentheses mean negative, because
 *    accounting exports write `(12.34)` and reading that as positive twelve
 *    dollars inverts a refund. A comma NOT followed by exactly three digits is
 *    rejected rather than interpreted: `1,23` is €1.23 in Europe and a badly
 *    written $123 elsewhere, and picking one is a 100× error in whichever half
 *    of the world we picked wrong.
 *
 * 4. A NEGATIVE ROW IS AN ERROR, NOT A REVERSAL. Statements report returns as
 *    negative lines, and the engine models a reversal as referencing the exact
 *    event it undoes (§8) so that a clawback follows the original's own rate
 *    and policy. A CSV row carries no such reference. Importing negatives as
 *    standalone events would create ledger entries that reverse nothing and
 *    can never be reconciled against the sale they belong to. The row is
 *    reported instead, with a message that says what to do about it.
 *
 * 5. AN AMBIGUOUS IDEMPOTENCY KEY IS THE ONE REAL WEAKNESS, AND IT IS NAMED
 *    RATHER THAN HIDDEN. See `deriveSourceEventId` below, which is the longest
 *    comment in this file for a reason.
 *
 * 6. A BLANK COST CELL IS NOT ZERO. Blank means "this file does not say", so no
 *    cost row is written and the tenant's own margin reporting stays honest
 *    about what it does not know. An explicit `0` means "there was none" and is
 *    recorded as zero. Collapsing the two would let a missing column read as a
 *    fee of nothing, which is the invented-cost bug wearing a different hat.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { createHash } from "node:crypto";

import { parseDecimalToMinor, percentToBasisPoints } from "../../money";
import {
  RECORDABLE_COST_TYPES,
  type ContributorRef,
  type CostInput,
  type RecordableCostType,
  type RevenueEvent,
} from "../../revenue-event";
import type { CsvDocument, CsvRow } from "./parse";

// ============================================================
// Configuration — what the owner tells us about their file
// ============================================================

/**
 * Which column means what. Values are header names as they appear in the file.
 *
 * Only `amount` and `date` are required. Attribution comes from `work`, from
 * `contributor`, or from both — see `mapCsvRow` for what each combination does.
 */
export interface CsvColumnMapping {
  amount: string;
  date: string;

  /** Matched against `works.external_ref`, exactly as the Shopify adapter does. */
  work?: string;
  /** Matched against `contributors.external_ref`. Names the earner directly. */
  contributor?: string;

  /** The statement's own transaction id. Strongly preferred — see below. */
  reference?: string;

  quantity?: string;
  currency?: string;
  /** A percentage in the file (`50`, `12.5`) → basis points on the event. */
  share?: string;
  role?: string;
  /** Free text kept on the event's metadata so a row stays recognisable. */
  description?: string;

  /** Column per cost type. Types are the closed list, never free text. */
  costs?: Partial<Record<RecordableCostType, string>>;
}

export type CsvDateFormat = "iso" | "mdy" | "dmy";

export interface CsvImportConfig {
  mapping: CsvColumnMapping;

  /** How to read the date column. Never inferred — decision 2. */
  dateFormat: CsvDateFormat;

  /** Used for every row when no currency column is mapped. */
  currency: string;

  /**
   * Names this file, and is part of the idempotency key when no reference
   * column is mapped. Defaults to the filename on the screen.
   */
  statementLabel: string;
}

// ============================================================
// Outcomes
// ============================================================

export interface MappedCsvRow {
  line: number;
  event: Omit<RevenueEvent, "tenantId">;
  /** Kept so the preview can show the owner a row they recognise. */
  display: {
    workRef: string | null;
    contributorRef: string | null;
    amountMinor: bigint;
    currency: string;
    occurredAt: Date;
  };
}

export interface CsvRowError {
  line: number;
  message: string;
}

export interface CsvMapResult {
  rows: MappedCsvRow[];
  errors: CsvRowError[];
  warnings: string[];
}

export class CsvConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvConfigError";
  }
}

// ============================================================
// Field readers — each refuses rather than guesses
// ============================================================

/**
 * Read a decimal money string exactly. Decision 3.
 *
 * Deliberately narrow. It accepts what accounting and marketplace exports
 * actually emit — a currency symbol, thousands commas, a parenthesised negative
 * — and rejects everything else rather than falling through to a lenient parse.
 */
export function parseCsvMoney(raw: string): bigint {
  let text = raw.trim();
  if (text === "") throw new Error("empty");

  let negative = false;

  // `(12.34)` is accounting notation for −12.34. Reading it as positive would
  // turn a refund line into a sale.
  if (text.startsWith("(") && text.endsWith(")")) {
    negative = true;
    text = text.slice(1, -1).trim();
  }

  // Currency symbols and codes attached to the number: `$12.34`, `USD 12.34`,
  // `12.34 USD`. The code is discarded here — the event's currency comes from
  // the currency column or the file-wide choice, so that a file whose amounts
  // say USD and whose currency column says EUR is a contradiction somebody has
  // to resolve rather than one this function silently picks a winner for.
  text = text.replace(/^[^\d(+-]+/, "").replace(/[^\d)]+$/, "").trim();

  if (text.startsWith("-")) {
    negative = !negative;
    text = text.slice(1).trim();
  } else if (text.startsWith("+")) {
    text = text.slice(1).trim();
  }

  // Thousands separators, and the ambiguity that is rejected rather than read.
  if (text.includes(",")) {
    const groups = text.split(",");
    const head = groups.shift() ?? "";
    if (!/^\d+$/.test(head) || groups.some((group) => !/^\d{3}(\.\d*)?$/.test(group))) {
      throw new Error("ambiguous-comma");
    }
    text = head + groups.join("");
  }

  if (!/^\d*(\.\d*)?$/.test(text) || text === "" || text === ".") {
    throw new Error("not-a-number");
  }

  const minor = parseDecimalToMinor(text);
  return negative ? -minor : minor;
}

/**
 * Read a date in the format the owner chose. Decision 2.
 *
 * Produces UTC midnight for a date-only value, matching the UTC boundary used
 * by statements, emails and the 1099 year. A value carrying a time is accepted
 * only in ISO form, where the time zone is unambiguous.
 */
export function parseCsvDate(raw: string, format: CsvDateFormat): Date {
  const text = raw.trim();
  if (text === "") throw new Error("empty");

  let year: number;
  let month: number;
  let day: number;
  let timePart = "";

  if (format === "iso") {
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](.+))?$/);
    if (!match) throw new Error("format");
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
    timePart = match[4] ?? "";
  } else {
    // Separator may be `/`, `-` or `.`; the ORDER is what the owner chose, and
    // that is the only thing this branch is willing to be flexible about.
    const match = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
    if (!match) throw new Error("format");

    const first = Number(match[1]);
    const second = Number(match[2]);
    month = format === "mdy" ? first : second;
    day = format === "mdy" ? second : first;

    const rawYear = match[3];
    // A two-digit year is read as 2000-2099. Statements predating 2000 are not
    // a case worth supporting, and the alternative — a sliding window — moves
    // under the file as the years pass.
    year = rawYear.length === 2 ? 2000 + Number(rawYear) : Number(rawYear);
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) throw new Error("range");

  let ms = Date.UTC(year, month - 1, day);

  if (timePart) {
    const parsed = Date.parse(text.includes("T") ? text : text.replace(" ", "T"));
    if (Number.isNaN(parsed)) throw new Error("format");
    ms = parsed;
  }

  const date = new Date(ms);

  // Catches 31 February, which `Date.UTC` rolls forward into March rather than
  // rejecting. A rolled date lands in the wrong month and, at a year boundary,
  // the wrong tax year.
  if (
    !timePart &&
    (date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day)
  ) {
    throw new Error("range");
  }

  return date;
}

const DATE_FORMAT_HINT: Record<CsvDateFormat, string> = {
  iso: "YYYY-MM-DD",
  mdy: "MM/DD/YYYY",
  dmy: "DD/MM/YYYY",
};

// ============================================================
// The idempotency key — decision 5
// ============================================================

/**
 * Derive the `sourceEventId` for a row.
 *
 * ⚠️ THIS IS THE WEAKEST POINT IN THE WHOLE ADAPTER AND IT CANNOT BE ENGINEERED
 * AWAY — only chosen between, and then said out loud on the screen.
 *
 * A Shopify webhook carries `${orderId}:${lineItemId}`: the source system's own
 * identifier, stable across every redelivery. A spreadsheet row has no such
 * thing. Two strategies exist, with different failure modes:
 *
 * **A — a reference column.** When the statement carries its own transaction
 * id, that id IS the key and this whole problem disappears. Re-importing the
 * same file is a no-op no matter how the file was edited in between, and an
 * incremental statement containing last month's rows again skips exactly those
 * rows. This is why the screen asks for it first and says so.
 *
 * **B — a content hash, scoped to the statement label.** With no id, identity
 * has to come from what the row says: work, contributor, date, amount,
 * currency, quantity, share. Two rows with identical content are genuinely
 * indistinguishable — a book that sold twice on the same day at the same price
 * reports as two identical lines — so an occurrence ordinal is appended, and
 * both are imported. Re-uploading the file reproduces the same hashes AND the
 * same ordinals, so every row collides on the unique index and nothing is paid
 * twice.
 *
 * The residual risk in B, stated plainly because it is real: the label is part
 * of the key, so importing overlapping rows under two DIFFERENT labels pays
 * them twice. That is the failure this design accepts, and it is chosen over
 * the alternative — a label-free hash — because that one silently DROPS a
 * genuine repeat sale in a later statement, and this codebase's standing rule
 * is that not paying is recoverable and overpaying is not.
 *
 * Both halves of that trade are handled outside this function rather than
 * pretended away: the preview reports how many rows are already recorded, and
 * separately reports rows that look like sales already recorded under a
 * different key, which is the only thing that catches the double-label case.
 */
function deriveSourceEventId(
  config: CsvImportConfig,
  reference: string | null,
  identity: string,
  occurrence: number
): string {
  if (reference !== null) return reference;

  const hash = createHash("sha256").update(identity).digest("hex").slice(0, 16);
  return `${config.statementLabel}:${hash}#${occurrence}`;
}

// ============================================================
// Mapping
// ============================================================

function indexHeaders(headers: string[]): Map<string, number> {
  const index = new Map<string, number>();
  headers.forEach((name, position) => {
    // First occurrence wins. A duplicated header is reported as a warning by
    // `validateMapping`; silently taking the last one would make the mapping an
    // owner chose on screen read a different column than the one they saw.
    if (!index.has(name)) index.set(name, position);
  });
  return index;
}

/**
 * Check the mapping against the file's actual headers, before any row is read.
 *
 * Fails the whole import rather than producing an error on every line: a
 * mapping that names a column the file does not have is one mistake, and
 * reporting it eight thousand times buries it.
 */
export function validateMapping(document: CsvDocument, config: CsvImportConfig): string[] {
  const warnings: string[] = [];
  const headers = new Set(document.headers);

  const required: Array<[string, string | undefined]> = [
    ["amount", config.mapping.amount],
    ["date", config.mapping.date],
  ];

  for (const [field, column] of required) {
    if (!column) throw new CsvConfigError(`Choose which column holds the ${field}.`);
    if (!headers.has(column)) {
      throw new CsvConfigError(`The file has no column called "${column}".`);
    }
  }

  const optional: Array<[string, string | undefined]> = [
    ["work", config.mapping.work],
    ["contributor", config.mapping.contributor],
    ["reference", config.mapping.reference],
    ["quantity", config.mapping.quantity],
    ["currency", config.mapping.currency],
    ["share", config.mapping.share],
    ["role", config.mapping.role],
    ["description", config.mapping.description],
    ...Object.entries(config.mapping.costs ?? {}),
  ];

  for (const [field, column] of optional) {
    if (column && !headers.has(column)) {
      throw new CsvConfigError(`The file has no column called "${column}" (chosen for ${field}).`);
    }
  }

  for (const [type] of Object.entries(config.mapping.costs ?? {})) {
    if (!(RECORDABLE_COST_TYPES as readonly string[]).includes(type)) {
      throw new CsvConfigError(`"${type}" is not a cost the system recognises.`);
    }
  }

  if (!config.mapping.work && !config.mapping.contributor) {
    throw new CsvConfigError(
      "Choose a column naming either the work or the person, so the money can be attributed."
    );
  }

  if (!/^[A-Za-z]{3}$/.test(config.currency)) {
    throw new CsvConfigError("Currency must be a three-letter code, like USD.");
  }

  if (!config.mapping.reference) {
    warnings.push(
      "No reference column is mapped, so rows are identified by their contents and this " +
        `statement's name ("${config.statementLabel}"). Importing the same rows again under a ` +
        "different name would pay them a second time."
    );
  }

  if (config.mapping.share && !config.mapping.contributor) {
    warnings.push(
      "A share column only takes effect when the row also names a person; without one the " +
        "split comes from your rates."
    );
  }

  const duplicated = document.headers.filter(
    (name, position) => name !== "" && document.headers.indexOf(name) !== position
  );
  if (duplicated.length > 0) {
    warnings.push(
      `The file has more than one column called ${[...new Set(duplicated)]
        .map((name) => `"${name}"`)
        .join(", ")}. The first of each is used.`
    );
  }

  if (document.ragged.length > 0) {
    warnings.push(
      `${document.ragged.length} row(s) have a different number of columns than the header ` +
        `and were skipped (line${document.ragged.length === 1 ? "" : "s"} ` +
        `${document.ragged.slice(0, 5).map((row) => row.line).join(", ")}` +
        `${document.ragged.length > 5 ? ", …" : ""}).`
    );
  }

  return warnings;
}

/** Map a whole document. Rows are independent — one bad row never stops another. */
export function mapCsvDocument(document: CsvDocument, config: CsvImportConfig): CsvMapResult {
  const warnings = validateMapping(document, config);
  const headerIndex = indexHeaders(document.headers);

  const rows: MappedCsvRow[] = [];
  const errors: CsvRowError[] = [];

  /** Occurrence counts for identical rows — see `deriveSourceEventId`. */
  const seen = new Map<string, number>();
  const usedKeys = new Map<string, number>();

  for (const row of document.rows) {
    try {
      const mapped = mapCsvRow(row, headerIndex, config, seen);

      // A reference column with repeated values inside one file is a data
      // problem, not a duplicate to skip: the second row would collide on the
      // unique index and be reported as "already imported", which reads as
      // reassurance rather than as the error it is.
      const first = usedKeys.get(mapped.event.sourceEventId);
      if (first !== undefined) {
        errors.push({
          line: row.line,
          message: `Reference "${mapped.event.sourceEventId}" is also used on line ${first}. References must be unique.`,
        });
        continue;
      }
      usedKeys.set(mapped.event.sourceEventId, row.line);

      rows.push(mapped);
    } catch (error) {
      errors.push({
        line: row.line,
        message: error instanceof Error ? error.message : "This row could not be read.",
      });
    }
  }

  return { rows, errors, warnings };
}

function cell(row: CsvRow, headerIndex: Map<string, number>, column: string | undefined): string {
  if (!column) return "";
  const position = headerIndex.get(column);
  if (position === undefined) return "";
  return (row.fields[position] ?? "").trim();
}

function mapCsvRow(
  row: CsvRow,
  headerIndex: Map<string, number>,
  config: CsvImportConfig,
  seen: Map<string, number>
): MappedCsvRow {
  const { mapping } = config;

  // ---- Amount ----
  const rawAmount = cell(row, headerIndex, mapping.amount);
  let grossAmountMinor: bigint;
  try {
    grossAmountMinor = parseCsvMoney(rawAmount);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    if (reason === "empty") throw new Error("The amount is blank.");
    if (reason === "ambiguous-comma") {
      throw new Error(
        `"${rawAmount}" is ambiguous — a comma here could be a decimal point or a thousands ` +
          "separator. Export the file with a full stop as the decimal point."
      );
    }
    throw new Error(`"${rawAmount}" is not an amount this can read.`);
  }

  if (grossAmountMinor < 0n) {
    // Decision 4. The message says what to do, because "rejected" without a
    // next step is how an owner concludes the importer is broken.
    throw new Error(
      `The amount ${rawAmount} is negative. Returns and chargebacks have to be recorded against ` +
        "the sale they undo, so remove these rows and refund the original sale instead."
    );
  }

  // ---- Date ----
  const rawDate = cell(row, headerIndex, mapping.date);
  let occurredAt: Date;
  try {
    occurredAt = parseCsvDate(rawDate, config.dateFormat);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    if (reason === "empty") throw new Error("The date is blank.");
    throw new Error(
      `"${rawDate}" is not a date in ${DATE_FORMAT_HINT[config.dateFormat]} form.`
    );
  }

  // ---- Currency ----
  const rawCurrency = cell(row, headerIndex, mapping.currency);
  const currency = (rawCurrency || config.currency).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error(`"${rawCurrency}" is not a three-letter currency code.`);
  }

  // ---- Quantity ----
  const rawQuantity = cell(row, headerIndex, mapping.quantity);
  let quantity = 1;
  if (rawQuantity !== "") {
    if (!/^\d+$/.test(rawQuantity)) {
      throw new Error(`"${rawQuantity}" is not a whole number of units.`);
    }
    quantity = Number(rawQuantity);
  }

  // ---- Attribution ----
  const workRef = mapping.work ? cell(row, headerIndex, mapping.work) : "";
  const contributorRef = mapping.contributor
    ? cell(row, headerIndex, mapping.contributor)
    : "";

  if (workRef === "" && contributorRef === "") {
    throw new Error(
      mapping.work && mapping.contributor
        ? "The row names neither a work nor a person."
        : `The ${mapping.contributor ? "person" : "work"} column is blank.`
    );
  }

  const contributorRefs: ContributorRef[] = [];
  if (contributorRef !== "") {
    const role = cell(row, headerIndex, mapping.role);

    let shareBasisPoints: number | undefined;
    const rawShare = cell(row, headerIndex, mapping.share);
    if (mapping.share && rawShare !== "") {
      // A percentage, not a fraction. `0.5` in a share column means half a
      // percent here, and the screen says so — the alternative is a reading
      // that differs by 200× depending on which convention the file used.
      const percent = Number(rawShare.replace(/%$/, "").trim());
      if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        throw new Error(`"${rawShare}" is not a percentage between 0 and 100.`);
      }
      try {
        shareBasisPoints = percentToBasisPoints(percent);
      } catch {
        throw new Error(`"${rawShare}" is finer than one hundredth of a percent.`);
      }
    }

    contributorRefs.push({
      ref: contributorRef,
      role: role || undefined,
      shareBasisPoints,
    });
  }

  // ---- Costs (decision 6) ----
  const costs: CostInput[] = [];
  for (const [type, column] of Object.entries(mapping.costs ?? {})) {
    if (!column) continue;
    const rawCost = cell(row, headerIndex, column);
    if (rawCost === "") continue; // Blank is "not stated", never zero.

    let amountMinor: bigint;
    try {
      amountMinor = parseCsvMoney(rawCost);
    } catch {
      throw new Error(`"${rawCost}" in the ${type.replace(/_/g, " ")} column is not an amount.`);
    }

    if (amountMinor < 0n) {
      throw new Error(
        `The ${type.replace(/_/g, " ")} cost ${rawCost} is negative. A cost that gives money ` +
          "back is a refund, not a cost."
      );
    }

    costs.push({
      type,
      amountMinor,
      currency,
      source: "csv_import",
      resolvedAt: occurredAt,
    });
  }

  // ---- Identity ----
  const rawReference = mapping.reference ? cell(row, headerIndex, mapping.reference) : "";
  if (mapping.reference && rawReference === "") {
    // Falling back to a content hash for just this row would give it a key
    // that a later re-import (where the reference is filled in) would not
    // reproduce — so the row would be paid twice, by the one mechanism this
    // whole design exists to prevent.
    throw new Error("The reference column is blank, so this row cannot be identified.");
  }

  const identity = [
    workRef,
    contributorRef,
    occurredAt.toISOString(),
    grossAmountMinor.toString(),
    currency,
    String(quantity),
    contributorRefs[0]?.shareBasisPoints ?? "",
  ].join("|");

  const occurrence = (seen.get(identity) ?? 0) + 1;
  seen.set(identity, occurrence);

  const description = cell(row, headerIndex, mapping.description);

  return {
    line: row.line,
    event: {
      source: "csv",
      sourceEventId: deriveSourceEventId(
        config,
        mapping.reference ? rawReference : null,
        identity,
        occurrence
      ),
      direction: "sale",
      occurredAt,
      grossAmountMinor,
      currency,
      quantity,
      workRef: workRef || undefined,
      contributorRefs,
      costs,
      metadata: {
        importedFrom: "csv",
        statement: config.statementLabel,
        line: row.line,
        ...(description ? { description } : {}),
      },
    },
    display: {
      workRef: workRef || null,
      contributorRef: contributorRef || null,
      amountMinor: grossAmountMinor,
      currency,
      occurredAt,
    },
  };
}
