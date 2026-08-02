/**
 * The DB-facing half of the CSV importer: preview, then commit.
 *
 * `map.ts` decides what a row *means*; this decides who it belongs to, what
 * would happen if it were imported, and — only when asked a second time —
 * writes it.
 *
 * ⚠️ WHY THERE ARE TWO STEPS, AND WHY THAT IS NOT UI POLISH.
 *
 * Every other way revenue reaches this engine is a webhook: the sale already
 * happened somewhere else and arrives whether anyone is watching or not. An
 * import is the opposite — a person choosing to turn a file into money owed,
 * from a file they may have edited, exported with the wrong settings, or
 * already imported last week. The failure mode is not a dropped sale, it is a
 * thousand rows written at once that somebody then has to unpick by hand
 * against an append-only ledger where the correction is a reversal per row.
 *
 * So the preview answers, before anything is written: how many rows can be read
 * at all, how many are already recorded, how many name a work or a person this
 * business does not have, how much money this adds up to, and — the one that
 * catches the mistake the design cannot otherwise catch — how many rows look
 * like sales already recorded under a different identity.
 *
 * THE PREVIEW WRITES NOTHING AND HOLDS NO STATE. The commit re-parses the file
 * from scratch rather than trusting anything cached from the preview, so there
 * is no window in which the file the owner approved and the file that gets
 * imported can differ.
 *
 * WHAT THIS MODULE WILL NOT DO. It will not skip a row because it resembles
 * another, will not repair a row it cannot read, and will not import a subset
 * "as far as it got" without saying which rows those were. Same rule as
 * everywhere else: an unimported row is recoverable, a wrong payment is not.
 */

import { and, eq, gte, inArray, lte } from "drizzle-orm";

import * as schema from "@shared/engine-schema";
import { ingestEvent, type EngineDb, type IngestResult } from "../../ingest";
import type { RevenueEvent } from "../../revenue-event";
import { attributeWork } from "../attribution";
import { mapCsvDocument, type CsvImportConfig, type CsvRowError, type MappedCsvRow } from "./map";
import { parseCsv, type CsvDocument } from "./parse";

/**
 * The ceiling on one import.
 *
 * Not a licence limit — a blast-radius limit. Everything below is bounded by
 * it: the memory the parse takes, the number of round trips the commit makes,
 * and above all how much an owner has to unpick if they approve the wrong file.
 * A larger statement is imported as several files, which is also how it is
 * reviewed.
 */
export const MAX_IMPORT_ROWS = 20_000;

/**
 * The same ceiling expressed in bytes, because the row count alone does not
 * bound the work: one 8 MB cell is a single row and would still be parsed,
 * hashed and held in memory. Both limits are checked.
 */
export const MAX_IMPORT_BYTES = 8_000_000;

/** Postgres parameter limits make one enormous `IN (…)` a bad idea. */
const LOOKUP_CHUNK = 500;

/**
 * How many existing events the look-alike check will scan before giving up.
 *
 * It degrades honestly rather than silently: past this, the preview says the
 * check could not be run instead of reporting zero look-alikes, which would
 * read as a clean bill of health.
 */
const LOOKALIKE_SCAN_LIMIT = 50_000;

// ============================================================
// Preview
// ============================================================

export interface CsvPreviewRow {
  line: number;
  workRef: string | null;
  contributorRef: string | null;
  amountMinor: bigint;
  currency: string;
  occurredAt: Date;
  outcome: "import" | "hold" | "already_imported";
  /** Why it would be held. Shown on the row, not aggregated away. */
  reason?: string;
}

export interface CsvPreview {
  statementLabel: string;
  delimiter: string;
  headers: string[];

  /** Rows the parser produced, before mapping. */
  totalRows: number;
  /** Rows that mapped cleanly. */
  readableRows: number;

  willImport: number;
  willHold: number;
  alreadyImported: number;

  /** Sum of the rows that would be imported OR held. Excludes duplicates. */
  totalMinor: bigint;
  currencies: string[];

  errors: CsvRowError[];
  warnings: string[];

  /** Distinct references that this business has no record of. */
  unknownWorks: string[];
  unknownContributors: string[];

  /**
   * Rows matching an already-recorded sale on work, date and amount, but under
   * a different identity — so they will import as NEW money.
   */
  lookAlikes: Array<{ line: number; existingSource: string; existingSourceEventId: string }>;
  lookAlikeCheckSkipped: boolean;

  rows: CsvPreviewRow[];
}

interface ResolvedRow {
  mapped: MappedCsvRow;
  event: Omit<RevenueEvent, "tenantId">;
  holdReason?: string;
  alreadyImported: boolean;
}

/**
 * Parse and map, with the row ceiling enforced before anything else happens.
 *
 * Separate from `previewCsvImport` so the commit path reaches the identical
 * document through the identical code, rather than a second implementation
 * that agrees with it today.
 */
function readDocument(content: string): CsvDocument {
  if (Buffer.byteLength(content, "utf8") > MAX_IMPORT_BYTES) {
    throw new CsvImportError(
      `This file is larger than ${Math.floor(MAX_IMPORT_BYTES / 1_000_000)} MB. ` +
        "Split it and import the parts separately."
    );
  }

  const document = parseCsv(content);

  if (document.rows.length > MAX_IMPORT_ROWS) {
    throw new CsvImportError(
      `This file has ${document.rows.length} rows. Import at most ` +
        `${MAX_IMPORT_ROWS} at a time so the result stays reviewable.`
    );
  }

  return document;
}

export class CsvImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvImportError";
  }
}

/**
 * Resolve every mapped row against the tenant's data.
 *
 * Attribution follows the row: a row naming a person names them directly (how
 * royalty statements work — the statement already knows whose track it is),
 * and a row naming only a work is expanded through `work_contributors` exactly
 * as a Shopify line is. When a row names both, the person on the row wins,
 * because the file is the more specific statement of fact and overriding it
 * with the catalogue would silently pay somebody the statement did not name.
 */
async function resolveRows(
  db: EngineDb,
  tenantId: string,
  mappedRows: MappedCsvRow[]
): Promise<{
  resolved: ResolvedRow[];
  unknownWorks: string[];
  unknownContributors: string[];
}> {
  // Attribution is cached per work reference: a statement has thousands of rows
  // and tens of works, and one query per row would turn a 5,000-row import into
  // 5,000 round trips.
  const attributionCache = new Map<string, Awaited<ReturnType<typeof attributeWork>>>();

  const resolved: ResolvedRow[] = [];
  const unknownWorks = new Set<string>();
  const unknownContributors = new Set<string>();

  // Which contributor references exist at all, for the ones named on rows.
  const namedRefs = [
    ...new Set(
      mappedRows
        .map((row) => row.display.contributorRef)
        .filter((ref): ref is string => Boolean(ref))
    ),
  ];

  const knownRefs = new Set<string>();
  for (let i = 0; i < namedRefs.length; i += LOOKUP_CHUNK) {
    const chunk = namedRefs.slice(i, i + LOOKUP_CHUNK);
    const rows = await db
      .select({ externalRef: schema.contributors.externalRef })
      .from(schema.contributors)
      .where(
        and(
          eq(schema.contributors.tenantId, tenantId),
          inArray(schema.contributors.externalRef, chunk)
        )
      );
    for (const row of rows) if (row.externalRef) knownRefs.add(row.externalRef);
  }

  for (const mapped of mappedRows) {
    const event = { ...mapped.event };
    let holdReason: string | undefined;

    if (event.contributorRefs.length > 0) {
      const ref = event.contributorRefs[0].ref;
      if (!knownRefs.has(ref)) unknownContributors.add(ref);
    } else {
      const workRef = mapped.display.workRef;
      let attribution = workRef ? attributionCache.get(workRef) : undefined;
      if (workRef && !attribution) {
        attribution = await attributeWork(db, tenantId, workRef);
        attributionCache.set(workRef, attribution);
      }

      if (attribution && attribution.contributorRefs.length > 0) {
        event.contributorRefs = attribution.contributorRefs;
      } else {
        if (workRef) unknownWorks.add(workRef);
        // Not set as `holdForReview`: `resolveReferences` discovers the same
        // thing during ingestion and words it better. Setting it here would
        // duplicate the sentence in the review queue.
        holdReason = attribution?.reason;
      }
    }

    resolved.push({ mapped, event, holdReason, alreadyImported: false });
  }

  return {
    resolved,
    unknownWorks: [...unknownWorks],
    unknownContributors: [...unknownContributors],
  };
}

/** Which of these keys does the tenant already have a CSV event for? */
async function findAlreadyImported(
  db: EngineDb,
  tenantId: string,
  keys: string[]
): Promise<Set<string>> {
  const found = new Set<string>();

  for (let i = 0; i < keys.length; i += LOOKUP_CHUNK) {
    const chunk = keys.slice(i, i + LOOKUP_CHUNK);
    const rows = await db
      .select({ sourceEventId: schema.revenueEvents.sourceEventId })
      .from(schema.revenueEvents)
      .where(
        and(
          eq(schema.revenueEvents.tenantId, tenantId),
          eq(schema.revenueEvents.source, "csv"),
          inArray(schema.revenueEvents.sourceEventId, chunk)
        )
      );
    for (const row of rows) found.add(row.sourceEventId);
  }

  return found;
}

/**
 * Find rows that match an existing sale on its facts but not on its identity.
 *
 * ⚠️ THIS IS THE ONLY CHECK THAT CATCHES THE DOUBLE-IMPORT THE KEY DESIGN
 * CANNOT — see `deriveSourceEventId` in `map.ts`. Without a reference column
 * the statement's name is part of every key, so the same file imported twice
 * under two names produces two sets of keys, both new, and pays everything
 * twice. Matching on (work, date, amount) instead of on the key is what makes
 * that visible.
 *
 * It reports; it never blocks. A real business genuinely does sell the same
 * work twice on the same day for the same price, and a check that refused
 * those would be wrong more often than it was right. Same posture as the 1099
 * thresholds: flag, don't hide.
 *
 * Deliberately scoped to sales already in the ledger, not to other rows in the
 * same file — identical rows within one file are handled by the occurrence
 * ordinal, and reporting them here would flag every legitimate repeat sale.
 */
async function findLookAlikes(
  db: EngineDb,
  tenantId: string,
  rows: ResolvedRow[]
): Promise<{ lookAlikes: CsvPreview["lookAlikes"]; skipped: boolean }> {
  const candidates = rows.filter((row) => !row.alreadyImported);
  if (candidates.length === 0) return { lookAlikes: [], skipped: false };

  let earliest = candidates[0].event.occurredAt;
  let latest = candidates[0].event.occurredAt;
  for (const row of candidates) {
    if (row.event.occurredAt < earliest) earliest = row.event.occurredAt;
    if (row.event.occurredAt > latest) latest = row.event.occurredAt;
  }

  const existing = await db
    .select({
      source: schema.revenueEvents.source,
      sourceEventId: schema.revenueEvents.sourceEventId,
      workRef: schema.revenueEvents.workRef,
      occurredAt: schema.revenueEvents.occurredAt,
      grossAmountMinor: schema.revenueEvents.grossAmountMinor,
      currency: schema.revenueEvents.currency,
    })
    .from(schema.revenueEvents)
    .where(
      and(
        eq(schema.revenueEvents.tenantId, tenantId),
        eq(schema.revenueEvents.direction, "sale"),
        gte(schema.revenueEvents.occurredAt, earliest),
        lte(schema.revenueEvents.occurredAt, latest)
      )
    )
    .limit(LOOKALIKE_SCAN_LIMIT + 1);

  if (existing.length > LOOKALIKE_SCAN_LIMIT) {
    return { lookAlikes: [], skipped: true };
  }

  const index = new Map<string, { source: string; sourceEventId: string }>();
  for (const row of existing) {
    const key = [
      row.workRef ?? "",
      row.occurredAt.toISOString(),
      String(row.grossAmountMinor),
      row.currency,
    ].join("|");
    if (!index.has(key)) {
      index.set(key, { source: row.source, sourceEventId: row.sourceEventId });
    }
  }

  const lookAlikes: CsvPreview["lookAlikes"] = [];
  for (const row of candidates) {
    const key = [
      row.event.workRef ?? "",
      row.event.occurredAt.toISOString(),
      row.event.grossAmountMinor.toString(),
      row.event.currency,
    ].join("|");

    const match = index.get(key);
    if (match && match.sourceEventId !== row.event.sourceEventId) {
      lookAlikes.push({
        line: row.mapped.line,
        existingSource: match.source,
        existingSourceEventId: match.sourceEventId,
      });
    }
  }

  return { lookAlikes, skipped: false };
}

export async function previewCsvImport(
  db: EngineDb,
  options: { tenantId: string; content: string; config: CsvImportConfig }
): Promise<CsvPreview> {
  const document = readDocument(options.content);
  const mapping = mapCsvDocument(document, options.config);

  const { resolved, unknownWorks, unknownContributors } = await resolveRows(
    db,
    options.tenantId,
    mapping.rows
  );
  const unknownContributorSet = new Set(unknownContributors);

  const already = await findAlreadyImported(
    db,
    options.tenantId,
    resolved.map((row) => row.event.sourceEventId)
  );
  for (const row of resolved) {
    row.alreadyImported = already.has(row.event.sourceEventId);
  }

  const { lookAlikes, skipped } = await findLookAlikes(db, options.tenantId, resolved);
  const lookAlikeLines = new Set(lookAlikes.map((entry) => entry.line));

  const previewRows: CsvPreviewRow[] = [];
  let willImport = 0;
  let willHold = 0;
  let alreadyImported = 0;
  let totalMinor = 0n;
  const currencies = new Set<string>();

  for (const row of resolved) {
    // Mirrors what `ingestEvent` will actually decide: it holds an event whose
    // contributor references it cannot resolve, and one with no contributors at
    // all. References that came from `work_contributors` are known-good by
    // construction — they were just read out of the database.
    const namedRef = row.event.contributorRefs[0]?.ref;
    const attributable =
      row.event.contributorRefs.length > 0 &&
      !(namedRef !== undefined && unknownContributorSet.has(namedRef));

    const outcome: CsvPreviewRow["outcome"] = row.alreadyImported
      ? "already_imported"
      : attributable
        ? "import"
        : "hold";

    if (outcome === "already_imported") {
      alreadyImported += 1;
    } else {
      totalMinor += row.event.grossAmountMinor;
      currencies.add(row.event.currency);
      if (outcome === "hold") willHold += 1;
      else willImport += 1;
    }

    previewRows.push({
      line: row.mapped.line,
      workRef: row.mapped.display.workRef,
      contributorRef: row.mapped.display.contributorRef,
      amountMinor: row.event.grossAmountMinor,
      currency: row.event.currency,
      occurredAt: row.event.occurredAt,
      outcome,
      reason:
        outcome === "hold"
          ? (row.holdReason ??
            (row.event.contributorRefs.length > 0
              ? `No person matches "${row.event.contributorRefs[0].ref}".`
              : "Nobody could be attributed to this row."))
          : lookAlikeLines.has(row.mapped.line)
            ? "Looks like a sale already recorded."
            : undefined,
    });
  }

  return {
    statementLabel: options.config.statementLabel,
    delimiter: document.delimiter,
    headers: document.headers,
    totalRows: document.rows.length,
    readableRows: mapping.rows.length,
    willImport,
    willHold,
    alreadyImported,
    totalMinor,
    currencies: [...currencies],
    errors: mapping.errors,
    warnings: mapping.warnings,
    unknownWorks,
    unknownContributors,
    lookAlikes,
    lookAlikeCheckSkipped: skipped,
    rows: previewRows,
  };
}

// ============================================================
// Commit
// ============================================================

export interface CsvImportOutcome {
  line: number;
  sourceEventId: string;
  status: IngestResult["status"];
  eventId?: string;
  allocatedMinor: bigint;
  reason?: string;
}

export interface CsvImportResult {
  statementLabel: string;
  imported: number;
  heldForReview: number;
  duplicates: number;
  failed: number;
  totalAllocatedMinor: bigint;
  totalGrossMinor: bigint;
  errors: CsvRowError[];
  outcomes: CsvImportOutcome[];
}

/**
 * Import the file.
 *
 * ROWS ARE INDEPENDENT, AND NOT ONE TRANSACTION. Each row goes through
 * `ingestEvent`, which is itself transactional — an event, its costs, its
 * allocations and its ledger entries either all land or none do. Wrapping the
 * whole file in a single transaction instead would mean one unreadable row at
 * line 4,000 discarding 3,999 correct imports, and would hold a write
 * transaction open for the length of the run.
 *
 * This mirrors how a Shopify order treats its lines, and how a payout batch
 * treats one contributor's failed transfer, for the same reason: partial
 * progress that is reported is better than all-or-nothing that is not.
 */
export async function commitCsvImport(
  db: EngineDb,
  options: { tenantId: string; content: string; config: CsvImportConfig }
): Promise<CsvImportResult> {
  const document = readDocument(options.content);
  const mapping = mapCsvDocument(document, options.config);
  const { resolved } = await resolveRows(db, options.tenantId, mapping.rows);

  const result: CsvImportResult = {
    statementLabel: options.config.statementLabel,
    imported: 0,
    heldForReview: 0,
    duplicates: 0,
    failed: 0,
    totalAllocatedMinor: 0n,
    totalGrossMinor: 0n,
    errors: [...mapping.errors],
    outcomes: [],
  };

  for (const row of resolved) {
    const event: RevenueEvent = { ...row.event, tenantId: options.tenantId };

    try {
      const outcome = await ingestEvent(db, event, {
        holdForReview: row.holdReason,
      });

      result.outcomes.push({
        line: row.mapped.line,
        sourceEventId: event.sourceEventId,
        status: outcome.status,
        eventId: outcome.eventId,
        allocatedMinor: outcome.totalAllocatedMinor,
        reason: outcome.reviewReason,
      });

      switch (outcome.status) {
        case "ingested":
          result.imported += 1;
          result.totalAllocatedMinor += outcome.totalAllocatedMinor;
          result.totalGrossMinor += event.grossAmountMinor;
          break;
        case "needs_review":
          result.heldForReview += 1;
          result.totalGrossMinor += event.grossAmountMinor;
          break;
        default:
          result.duplicates += 1;
      }
    } catch (error) {
      // One row that the engine refuses must not abandon the rest of the file.
      // It is reported against its line number so the owner can fix that row
      // and re-import — which is safe, because every row that DID land keeps
      // its key and comes back as a duplicate.
      result.failed += 1;
      result.errors.push({
        line: row.mapped.line,
        message: error instanceof Error ? error.message : "This row could not be imported.",
      });
    }
  }

  return result;
}
