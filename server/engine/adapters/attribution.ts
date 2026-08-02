/**
 * Turning "a sale of this work happened" into "and these people are owed".
 *
 * Shared by every adapter, because none of the source systems has a concept of
 * a contributor. Shopify knows a SKU; a royalty statement knows a title or an
 * ISRC. Both resolve through `works.external_ref` into `work_contributors`, and
 * the resolution has to behave identically or the same catalogue would pay
 * differently depending on which door the sale came in through.
 *
 * It lived inside the Shopify adapter until the CSV importer needed the same
 * behaviour. Copying it would have been the cheaper edit and the wrong one:
 * every rule below is a decision about when NOT to pay somebody, and two copies
 * drift on the first fix applied to one of them.
 *
 * NOTHING HERE THROWS. Every outcome — an unknown work, a work with nobody
 * attached, a contributor who cannot be addressed — is an ordinary operational
 * state that should produce a reviewable row an owner can fix, not a failed
 * webhook that the provider retries nineteen times.
 */

import { and, eq } from "drizzle-orm";

import * as schema from "@shared/engine-schema";
import type { EngineDb } from "../ingest";

export interface WorkAttribution {
  contributorRefs: Array<{ ref: string; role?: string }>;
  /** Set when nobody could be attached to this work. */
  reason?: string;
}

/** Expand a work reference into contributor references. */
export async function attributeWork(
  db: EngineDb,
  tenantId: string,
  workRef: string | null
): Promise<WorkAttribution> {
  if (!workRef) {
    return { contributorRefs: [], reason: "No work reference on the line." };
  }

  const [work] = await db
    .select()
    .from(schema.works)
    .where(
      and(eq(schema.works.tenantId, tenantId), eq(schema.works.externalRef, workRef))
    )
    .limit(1);

  if (!work) {
    return {
      contributorRefs: [],
      reason: `No work matches the reference "${workRef}".`,
    };
  }

  const links = await db
    .select({
      role: schema.workContributors.role,
      externalRef: schema.contributors.externalRef,
    })
    .from(schema.workContributors)
    .innerJoin(
      schema.contributors,
      eq(schema.workContributors.contributorId, schema.contributors.id)
    )
    .where(
      and(
        eq(schema.workContributors.tenantId, tenantId),
        eq(schema.workContributors.workId, work.id)
      )
    );

  if (links.length === 0) {
    return {
      contributorRefs: [],
      reason: `"${work.title ?? workRef}" has nobody attached to it.`,
    };
  }

  // `externalRef` is nullable — a contributor added by hand in the console has
  // no external reference until something imports them. They cannot be
  // addressed by an adapter, so they are dropped here and the line falls to
  // review rather than paying whoever happens to remain.
  const addressable = links.filter(
    (link): link is typeof link & { externalRef: string } => Boolean(link.externalRef)
  );

  if (addressable.length !== links.length) {
    return {
      contributorRefs: [],
      reason:
        `"${work.title ?? workRef}" has ${links.length - addressable.length} contributor(s) ` +
        "with no external reference, so this sale cannot be split automatically.",
    };
  }

  return {
    contributorRefs: addressable.map((link) => ({
      ref: link.externalRef,
      role: link.role ?? undefined,
    })),
  };
}
