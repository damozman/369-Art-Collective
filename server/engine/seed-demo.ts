/**
 * Demo data — a realistic, clean dataset for evaluating the product.
 *
 * SEPARATE FROM THE E2E SEED, deliberately. The e2e uses fixed calendar dates so
 * its assertions are deterministic; that makes it a good test and a poor demo,
 * because some of those dates sit in the future relative to the real clock and
 * every balance ends up looking strange.
 *
 * This seeder instead dates everything RELATIVE TO NOW, so the state on screen
 * is the state a real business would actually be in partway through a month:
 *
 *   - money already paid out last cycle
 *   - money earned and now payable
 *   - money earned but still inside the refund window
 *   - one refund that landed after payout, leaving a small deficit
 *   - one sale nobody could be paid for, waiting on a human
 *   - one person with no payout account connected yet
 *
 * Every one of those states is worth seeing, because each is a decision the
 * owner will eventually have to make.
 *
 * Run:  DATABASE_URL=... npm run seed:demo
 */

import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@shared/engine-schema";
import { createTenantUser } from "./admin-auth";
import { setContributorPassword } from "./auth";
import { ingestEvent, reverseEvent, type EngineDb } from "./ingest";
import { FixtureTransferExecutor, runPayoutBatch } from "./payout";
import type { RevenueEvent } from "./revenue-event";

const DAY = 24 * 60 * 60 * 1000;

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * DAY);
}

/** A sale, expressed the way an adapter would hand it over. */
function sale(options: {
  sourceEventId: string;
  occurredAt: Date;
  grossMinor: bigint;
  productionMinor: bigint;
  shippingMinor: bigint;
  contributorRefs: RevenueEvent["contributorRefs"];
  workRef?: string;
}): RevenueEvent {
  // Card fee: 2.9% + 30c, the same shape the marketplace uses.
  const feeMinor =
    (options.grossMinor * 290n + 5000n) / 10000n + 30n;

  return {
    tenantId: "demo-369",
    source: "shopify",
    sourceEventId: options.sourceEventId,
    direction: "sale",
    occurredAt: options.occurredAt,
    grossAmountMinor: options.grossMinor,
    currency: "USD",
    quantity: 1,
    workRef: options.workRef,
    contributorRefs: options.contributorRefs,
    costs: [
      { type: "production", amountMinor: options.productionMinor, currency: "USD", source: "printify" },
      { type: "shipping", amountMinor: options.shippingMinor, currency: "USD", source: "printify" },
      { type: "processing_fee", amountMinor: feeMinor, currency: "USD", source: "stripe" },
    ],
  };
}

export async function seedDemo(db: EngineDb): Promise<void> {
  await db.execute(sql`TRUNCATE engine_tenants CASCADE`);

  // ---- The business ----
  await db.insert(schema.tenants).values({
    id: "demo-369",
    name: "369 Art Collective",
    slug: "369",
    defaultCurrency: "USD",
    clawbackPolicy: "recoup",
    payoutHoldDays: 14,
    minimumPayoutMinor: 1000n,
  });

  await createTenantUser(db, {
    tenantId: "demo-369",
    email: "owner@example.com",
    name: "Owner",
    password: "demo password 123",
    role: "admin",
  });

  // ---- The people ----
  await db.insert(schema.contributors).values([
    { id: "demo-maya", tenantId: "demo-369", name: "Maya Chen", email: "maya@example.com", externalRef: "maya" },
    { id: "demo-james", tenantId: "demo-369", name: "James Okoro", email: "james@example.com", externalRef: "james" },
    { id: "demo-lena", tenantId: "demo-369", name: "Lena Fischer", email: "lena@example.com", externalRef: "lena" },
  ]);

  for (const id of ["demo-maya", "demo-james", "demo-lena"]) {
    await setContributorPassword(db, "demo-369", id, "demo password 123");
  }

  // Maya and James can be paid. Lena has not connected an account yet — a
  // completely normal state, and one the owner needs to be able to see.
  await db.insert(schema.contributorIdentities).values([
    {
      tenantId: "demo-369", contributorId: "demo-maya",
      stripeAccountId: "acct_demo_maya", stripePayoutsEnabled: true,
      taxIdentityStatus: "collected", taxFormType: "W-9",
    },
    {
      tenantId: "demo-369", contributorId: "demo-james",
      stripeAccountId: "acct_demo_james", stripePayoutsEnabled: true,
      taxIdentityStatus: "collected", taxFormType: "W-9",
    },
  ]);

  // ---- The works ----
  await db.insert(schema.works).values([
    { id: "demo-w1", tenantId: "demo-369", title: "Desert Bloom", externalRef: "art-101", productType: "canvas" },
    { id: "demo-w2", tenantId: "demo-369", title: "Harbour Lights", externalRef: "art-102", productType: "poster" },
    { id: "demo-w3", tenantId: "demo-369", title: "Second Movement", externalRef: "art-103", productType: "canvas" },
  ]);

  await db.insert(schema.workContributors).values([
    { tenantId: "demo-369", workId: "demo-w1", contributorId: "demo-maya", role: "artist" },
    { tenantId: "demo-369", workId: "demo-w2", contributorId: "demo-james", role: "artist" },
    // A collaboration — the multi-party case, which is most of the reason the
    // engine exists rather than a spreadsheet.
    { tenantId: "demo-369", workId: "demo-w3", contributorId: "demo-maya", role: "artist" },
    { tenantId: "demo-369", workId: "demo-w3", contributorId: "demo-lena", role: "collaborator" },
  ]);

  // ---- The rates ----
  await db.insert(schema.splitRules).values([
    {
      id: "demo-rule-artist", tenantId: "demo-369",
      ruleKey: "artist-standard", version: 1,
      effectiveFrom: daysAgo(365),
      scope: "tenant",
      basis: "net", method: "percent", valueBasisPoints: 3000,
      costDeductions: ["production", "shipping", "processing_fee"],
      priority: 0, currency: "USD",
    },
    {
      id: "demo-rule-collab", tenantId: "demo-369",
      ruleKey: "collaborator-share", version: 1,
      effectiveFrom: daysAgo(365),
      scope: "contributor", scopeRef: "demo-lena", contributorId: "demo-lena",
      basis: "net", method: "percent", valueBasisPoints: 1500,
      costDeductions: ["production", "shipping", "processing_fee"],
      priority: 10, currency: "USD",
    },
  ]);

  // ---- Sales ----
  // Old enough to have cleared the hold and been paid last cycle.
  await ingestEvent(db, sale({
    sourceEventId: "1001:1", occurredAt: daysAgo(75), grossMinor: 9900n,
    productionMinor: 1500n, shippingMinor: 800n, workRef: "art-101",
    contributorRefs: [{ ref: "maya", role: "artist" }],
  }));
  await ingestEvent(db, sale({
    sourceEventId: "1002:1", occurredAt: daysAgo(70), grossMinor: 4900n,
    productionMinor: 550n, shippingMinor: 629n, workRef: "art-102",
    contributorRefs: [{ ref: "james", role: "artist" }],
  }));

  // Pay out that first cycle, so there is real history on screen.
  await runPayoutBatch(db, {
    tenantId: "demo-369",
    asOf: daysAgo(50),
    executor: new FixtureTransferExecutor(),
  });

  // A refund landing AFTER that payout — the §8 case. Leaves Maya slightly
  // negative until her next sales recoup it.
  await reverseEvent(db, {
    tenantId: "demo-369",
    source: "shopify",
    originalSourceEventId: "1001:1",
    reversalSourceEventId: "refund-1001",
    occurredAt: daysAgo(40),
    reason: "customer chargeback",
  });

  // Recent sales: cleared the hold, payable now.
  await ingestEvent(db, sale({
    sourceEventId: "1003:1", occurredAt: daysAgo(30), grossMinor: 12900n,
    productionMinor: 1800n, shippingMinor: 850n, workRef: "art-101",
    contributorRefs: [{ ref: "maya", role: "artist" }],
  }));
  await ingestEvent(db, sale({
    sourceEventId: "1004:1", occurredAt: daysAgo(25), grossMinor: 8900n,
    productionMinor: 1200n, shippingMinor: 750n, workRef: "art-102",
    contributorRefs: [{ ref: "james", role: "artist" }],
  }));

  // A collaboration, so a single sale pays two people at different rates.
  await ingestEvent(db, sale({
    sourceEventId: "1005:1", occurredAt: daysAgo(20), grossMinor: 15900n,
    productionMinor: 1800n, shippingMinor: 850n, workRef: "art-103",
    contributorRefs: [
      { ref: "maya", role: "artist" },
      { ref: "lena", role: "collaborator" },
    ],
  }));

  // Still inside the 14-day refund window — earned, not yet payable.
  await ingestEvent(db, sale({
    sourceEventId: "1006:1", occurredAt: daysAgo(5), grossMinor: 9900n,
    productionMinor: 1500n, shippingMinor: 800n, workRef: "art-101",
    contributorRefs: [{ ref: "maya", role: "artist" }],
  }));
  await ingestEvent(db, sale({
    sourceEventId: "1007:1", occurredAt: daysAgo(2), grossMinor: 4900n,
    productionMinor: 550n, shippingMinor: 629n, workRef: "art-102",
    contributorRefs: [{ ref: "james", role: "artist" }],
  }));

  // A sale nobody can be paid for — the SKU points at someone not on file.
  // Recorded, flagged, and deliberately not guessed at.
  await ingestEvent(db, sale({
    sourceEventId: "1008:1", occurredAt: daysAgo(8), grossMinor: 7900n,
    productionMinor: 1200n, shippingMinor: 750n, workRef: "art-104",
    contributorRefs: [{ ref: "unknown-artist", role: "artist" }],
  }));
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema }) as unknown as EngineDb;

  await seedDemo(db);

  console.log("Demo data seeded.\n");
  console.log("  Owner console:      /manage/369");
  console.log("    owner@example.com / demo password 123\n");
  console.log("  Contributor portal: /portal/369");
  console.log("    maya@example.com  / demo password 123   (paid, refunded, and earning again)");
  console.log("    james@example.com / demo password 123   (steady earner)");
  console.log("    lena@example.com  / demo password 123   (collaborator, no payout account yet)");

  await pool.end();
}

if (process.argv[1] && process.argv[1].endsWith("seed-demo.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
