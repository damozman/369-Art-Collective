/**
 * The database reads behind the year-end payment report.
 *
 * Split from `report-1099.ts` so the rules about what counts as paid in a year
 * stay testable without a database. Everything arguable lives there; this file
 * is the SQL that feeds it.
 *
 * ONE QUERY, GROUPED IN THE DATABASE. The alternative — fetch every payout and
 * sum in JavaScript — reads a full year of transfers into memory to produce a
 * few dozen rows, and invites somebody to sum them with `+` on numbers rather
 * than bigints. Postgres sums exactly; the result comes back as a string and is
 * parsed with `BigInt`, never `Number`.
 */

import { and, asc, eq, gte, lt, sql } from "drizzle-orm";

import * as schema from "@shared/engine-schema";
import type { EngineDb } from "../ingest";
import {
  assembleReport,
  taxYearWindow,
  type TaxYearReport,
  type TaxYearRowInput,
} from "./report-1099";

/**
 * Build the report for one tenant and one calendar year.
 *
 * Tenant-scoped in the WHERE clause, not by filtering afterwards. The payouts
 * table is global and a year-end export is precisely the report somebody would
 * notice least if it quietly contained another business's people.
 */
export async function getTaxYearReport(
  db: EngineDb,
  tenantId: string,
  year: number
): Promise<TaxYearReport> {
  const { from, until } = taxYearWindow(year);

  const rows = await db
    .select({
      contributorId: schema.payouts.contributorId,
      name: schema.contributors.name,
      email: schema.contributors.email,
      currency: schema.payouts.currency,
      // Summed in Postgres and returned as text. `BigInt` below, never `Number`
      // — a lifetime of payouts can exceed what a float holds exactly, and a
      // tax figure is the last place to discover that.
      paidMinor: sql<string>`SUM(${schema.payouts.amountMinor})::text`,
      payoutCount: sql<number>`COUNT(*)::int`,
      firstPaidAt: sql<Date>`MIN(${schema.payouts.completedAt})`,
      lastPaidAt: sql<Date>`MAX(${schema.payouts.completedAt})`,
      stripeAccountId: schema.contributorIdentities.stripeAccountId,
      taxFormType: schema.contributorIdentities.taxFormType,
      taxIdentityStatus: schema.contributorIdentities.taxIdentityStatus,
    })
    .from(schema.payouts)
    .innerJoin(
      schema.contributors,
      eq(schema.contributors.id, schema.payouts.contributorId)
    )
    // LEFT, not INNER: somebody paid without an identity row is exactly the row
    // this report exists to surface. An inner join would hide them.
    .leftJoin(
      schema.contributorIdentities,
      eq(schema.contributorIdentities.contributorId, schema.payouts.contributorId)
    )
    .where(
      and(
        eq(schema.payouts.tenantId, tenantId),
        // Rule 2: only money that actually moved. `paid` is the only terminal
        // state in which a transfer succeeded.
        eq(schema.payouts.status, "paid"),
        // Rule 1 and 5: cash basis, half-open UTC window on when the money
        // moved — not on when it was earned, and not on when the batch opened.
        gte(schema.payouts.completedAt, from),
        lt(schema.payouts.completedAt, until)
      )
    )
    .groupBy(
      schema.payouts.contributorId,
      schema.contributors.name,
      schema.contributors.email,
      schema.payouts.currency,
      schema.contributorIdentities.stripeAccountId,
      schema.contributorIdentities.taxFormType,
      schema.contributorIdentities.taxIdentityStatus
    );

  const inputs: TaxYearRowInput[] = rows.map((row) => ({
    contributorId: row.contributorId,
    name: row.name,
    email: row.email,
    stripeAccountId: row.stripeAccountId ?? null,
    taxFormType: row.taxFormType ?? null,
    taxIdentityStatus: row.taxIdentityStatus ?? null,
    currency: row.currency,
    paidMinor: BigInt(row.paidMinor),
    payoutCount: Number(row.payoutCount),
    firstPaidAt: new Date(row.firstPaidAt),
    lastPaidAt: new Date(row.lastPaidAt),
  }));

  return assembleReport(year, inputs);
}

/**
 * Which calendar years this tenant actually paid anybody in.
 *
 * Drives the year picker. Offering a fixed list of recent years instead would
 * show empty reports for years the business did not exist, and an empty report
 * is indistinguishable from a broken one to the person reading it.
 */
export async function listTaxYears(db: EngineDb, tenantId: string): Promise<number[]> {
  // EXTRACT reads the stored value directly, with no `AT TIME ZONE` conversion.
  // These are `timestamp without time zone` columns holding UTC instants, so a
  // conversion here would shift the year for payouts near a boundary and make
  // the picker disagree with the report it opens — the one inconsistency that
  // would be blamed on the report rather than on the list.
  const rows = await db
    .select({
      year: sql<number>`EXTRACT(YEAR FROM ${schema.payouts.completedAt})::int`,
    })
    .from(schema.payouts)
    .where(and(eq(schema.payouts.tenantId, tenantId), eq(schema.payouts.status, "paid")))
    .groupBy(sql`1`)
    .orderBy(asc(sql`1`));

  return rows.map((row) => Number(row.year)).filter((year) => Number.isFinite(year));
}
