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

import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";

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

  // Advances issued in the same window (§10b, rule 6). A SEPARATE query rather
  // than a join: an advance and a payout are different events on different
  // tables, and joining them would multiply each payout row by the number of
  // advances the same person has — an over-report that grows with how well the
  // feature is used, which is the worst possible failure mode for a tax figure.
  const { advancesIssuedInYear } = await import("../advance");
  const advanceRows = await advancesIssuedInYear(db, tenantId, from, until);

  const advanceByKey = new Map<string, bigint>();
  for (const row of advanceRows) {
    const key = `${row.contributorId}:${row.currency}`;
    advanceByKey.set(key, (advanceByKey.get(key) ?? 0n) + row.totalMinor);
  }

  const inputs: TaxYearRowInput[] = rows.map((row) => {
    const key = `${row.contributorId}:${row.currency}`;
    const advanceMinor = advanceByKey.get(key) ?? 0n;
    advanceByKey.delete(key); // consumed; whatever is left is advance-only

    return {
      contributorId: row.contributorId,
      name: row.name,
      email: row.email,
      stripeAccountId: row.stripeAccountId ?? null,
      taxFormType: row.taxFormType ?? null,
      taxIdentityStatus: row.taxIdentityStatus ?? null,
      currency: row.currency,
      paidMinor: BigInt(row.paidMinor),
      advanceMinor,
      payoutCount: Number(row.payoutCount),
      firstPaidAt: new Date(row.firstPaidAt),
      lastPaidAt: new Date(row.lastPaidAt),
    };
  });

  // Anyone who took an advance and was never transferred to. Rule 6 says they
  // are a real reportable row — they received cash — and they would be invisible
  // if the report only ever started from the payouts table.
  if (advanceByKey.size > 0) {
    const orphanIds = [...advanceByKey.keys()].map((key) => key.split(":")[0]);

    const people = await db
      .select({
        id: schema.contributors.id,
        name: schema.contributors.name,
        email: schema.contributors.email,
        stripeAccountId: schema.contributorIdentities.stripeAccountId,
        taxFormType: schema.contributorIdentities.taxFormType,
        taxIdentityStatus: schema.contributorIdentities.taxIdentityStatus,
      })
      .from(schema.contributors)
      .leftJoin(
        schema.contributorIdentities,
        eq(schema.contributorIdentities.contributorId, schema.contributors.id)
      )
      .where(
        and(
          eq(schema.contributors.tenantId, tenantId),
          inArray(schema.contributors.id, orphanIds)
        )
      );

    const byId = new Map(people.map((person) => [person.id, person]));

    for (const [key, advanceMinor] of advanceByKey) {
      const [contributorId, currency] = key.split(":");
      const person = byId.get(contributorId);
      if (!person) continue;

      inputs.push({
        contributorId,
        name: person.name,
        email: person.email,
        stripeAccountId: person.stripeAccountId ?? null,
        taxFormType: person.taxFormType ?? null,
        taxIdentityStatus: person.taxIdentityStatus ?? null,
        currency,
        paidMinor: 0n,
        advanceMinor,
        payoutCount: 0,
        // No transfer happened, so there is no transfer date. Rule 6.
        firstPaidAt: null,
        lastPaidAt: null,
      });
    }
  }

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
