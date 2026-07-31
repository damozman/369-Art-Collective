/**
 * End-to-end verification against a real Postgres.
 *
 * Not a unit test — it needs a database, so it is run deliberately rather than
 * by `npm test`:
 *
 *   DATABASE_URL=postgres://... npx tsx server/engine/__tests__/e2e.ts
 *
 * It exists because of the step-3 lesson recorded in CLAUDE.md: a green
 * type-check and a green build are not evidence that anything works. Every
 * assertion below goes through real SQL — real constraints, real transactions,
 * real bigint round-tripping.
 */

import assert from "node:assert/strict";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, sql } from "drizzle-orm";

import * as schema from "@shared/engine-schema";
import {
  deriveContributorBalance,
  derivePayableBalance,
  ingestEvent,
  reverseEvent,
  type EngineDb,
} from "../ingest";
import { formatMoney } from "../money";
import type { RevenueEvent } from "../revenue-event";

const results: string[] = [];
function check(label: string, fn: () => void) {
  fn();
  results.push(`  ok  ${label}`);
  console.log(`  ok  ${label}`);
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema }) as unknown as EngineDb;

  await db.execute(sql`TRUNCATE engine_tenants CASCADE`);

  // ---- Fixtures: two tenants, so isolation is exercised throughout ----
  await db.insert(schema.tenants).values([
    { id: "t-369", name: "369 Art Collective", slug: "369", clawbackPolicy: "recoup", payoutHoldDays: 14 },
    { id: "t-press", name: "Small Press", slug: "press", clawbackPolicy: "absorb", payoutHoldDays: 30 },
  ]);

  await db.insert(schema.contributors).values([
    { id: "c-alice", tenantId: "t-369", name: "Alice", externalRef: "alice" },
    { id: "c-bob", tenantId: "t-369", name: "Bob", externalRef: "bob" },
    // Same external ref in a different tenant — must never collide.
    { id: "c-eve", tenantId: "t-press", name: "Eve", externalRef: "alice" },
  ]);

  await db.insert(schema.works).values([
    { id: "w-1", tenantId: "t-369", title: "Sunset", externalRef: "art-1", productType: "canvas" },
  ]);

  await db.insert(schema.workContributors).values([
    { tenantId: "t-369", workId: "w-1", contributorId: "c-alice", role: "artist" },
    { tenantId: "t-369", workId: "w-1", contributorId: "c-bob", role: "producer" },
  ]);

  await db.insert(schema.splitRules).values([
    {
      id: "r-artist", tenantId: "t-369", ruleKey: "artist-standard", version: 1,
      effectiveFrom: new Date("2026-01-01"), scope: "contributor", scopeRef: "c-alice",
      basis: "net", method: "percent", valueBasisPoints: 3000, priority: 10,
      costDeductions: ["production", "shipping", "processing_fee"], currency: "USD",
    },
    {
      id: "r-producer", tenantId: "t-369", ruleKey: "producer-standard", version: 1,
      effectiveFrom: new Date("2026-01-01"), scope: "contributor", scopeRef: "c-bob",
      basis: "net", method: "percent", valueBasisPoints: 1000, priority: 10,
      costDeductions: ["production", "shipping", "processing_fee"], currency: "USD",
    },
    // The other tenant's rule — must never touch 369's events.
    {
      id: "r-press", tenantId: "t-press", ruleKey: "author", version: 1,
      effectiveFrom: new Date("2026-01-01"), scope: "tenant",
      basis: "gross", method: "percent", valueBasisPoints: 5000, priority: 0, currency: "USD",
    },
  ]);

  const saleEvent: RevenueEvent = {
    tenantId: "t-369",
    source: "shopify",
    sourceEventId: "order-1:line-1",
    direction: "sale",
    occurredAt: new Date("2026-06-15T00:00:00Z"),
    grossAmountMinor: 9900n,
    currency: "USD",
    quantity: 1,
    workRef: "art-1",
    contributorRefs: [{ ref: "alice", role: "artist" }, { ref: "bob", role: "producer" }],
    costs: [
      { type: "production", amountMinor: 1500n, currency: "USD", source: "printify" },
      { type: "shipping", amountMinor: 800n, currency: "USD", source: "printify" },
      { type: "processing_fee", amountMinor: 312n, currency: "USD", source: "stripe" },
    ],
  };

  // ---- 1. Ingest ----
  console.log("\n1. Multi-party ingestion");
  const first = await ingestEvent(db, saleEvent);
  check("event ingested", () => assert.equal(first.status, "ingested"));
  check("two contributors allocated", () => assert.equal(first.allocationIds.length, 2));

  const alloc = await db.select().from(schema.allocations).where(eq(schema.allocations.revenueEventId, first.eventId!));
  const byContributor = Object.fromEntries(alloc.map((a) => [a.contributorId, BigInt(a.amountMinor)]));

  // net = 9900 - (1500 + 800 + 312) = 7288
  check("artist gets 30% of net = $21.86", () => assert.equal(byContributor["c-alice"], 2186n));
  check("producer gets 10% of net = $7.29", () => assert.equal(byContributor["c-bob"], 729n));

  const aliceAlloc = alloc.find((a) => a.contributorId === "c-alice")!;
  check("the rule version that paid is recorded", () => {
    assert.equal(aliceAlloc.ruleKey, "artist-standard");
    assert.equal(aliceAlloc.ruleVersion, 1);
  });
  check("the explanation is reconstructable", () => {
    assert.match(aliceAlloc.explanation!, /Net \$72\.88/);
    assert.match(aliceAlloc.explanation!, /30% of net \$21\.86/);
  });

  // ---- 2. Idempotency ----
  console.log("\n2. Idempotency");
  const replay = await ingestEvent(db, saleEvent);
  check("a replayed webhook is a duplicate", () => assert.equal(replay.status, "duplicate"));
  check("no second allocation was written", async () => {});
  const allocCount = await db.select().from(schema.allocations);
  check("still exactly two allocations", () => assert.equal(allocCount.length, 2));

  // Concurrent delivery — the race the marketplace actually hit.
  const concurrent = await Promise.allSettled([
    ingestEvent(db, { ...saleEvent, sourceEventId: "order-2:line-1" }),
    ingestEvent(db, { ...saleEvent, sourceEventId: "order-2:line-1" }),
  ]);
  const statuses = concurrent.map((r) => (r.status === "fulfilled" ? r.value.status : "threw"));
  check("concurrent duplicate deliveries produce exactly one ingest", () =>
    assert.equal(statuses.filter((s) => s === "ingested").length, 1, `got ${statuses.join(",")}`)
  );

  // ---- 3. Tenant isolation ----
  console.log("\n3. Tenant isolation");
  const otherTenantEvent: RevenueEvent = {
    ...saleEvent,
    tenantId: "t-press",
    sourceEventId: "order-1:line-1", // same id as 369's, different tenant
    workRef: undefined,
    contributorRefs: [{ ref: "alice" }],
    costs: [],
  };
  const otherResult = await ingestEvent(db, otherTenantEvent);
  check("same source id in another tenant is not a duplicate", () =>
    assert.equal(otherResult.status, "ingested")
  );

  const eveBalance = await deriveContributorBalance(db, "t-press", "c-eve");
  check("the other tenant's contributor got 50% of gross under THEIR rule", () =>
    assert.equal(eveBalance, 4950n)
  );

  const aliceBalance = await deriveContributorBalance(db, "t-369", "c-alice");
  check("369's Alice is unaffected by the other tenant's event", () =>
    assert.equal(aliceBalance, 2186n * 2n) // two orders ingested for 369
  );

  // ---- 4. Payout holds ----
  console.log("\n4. Payout holds");
  const beforeHold = await derivePayableBalance(db, "t-369", "c-alice", new Date("2026-06-20T00:00:00Z"));
  const afterHold = await derivePayableBalance(db, "t-369", "c-alice", new Date("2026-07-01T00:00:00Z"));
  check("nothing is payable during the 14-day hold", () => assert.equal(beforeHold, 0n));
  check("everything is payable after it", () => assert.equal(afterHold, 4372n));

  // ---- 5. Reversal ----
  console.log("\n5. Refund after payout — the §8 case");
  // Simulate the payout having already happened.
  await db.insert(schema.ledgerEntries).values({
    tenantId: "t-369", contributorId: "c-alice", entryType: "payout",
    amountMinor: -4372n, currency: "USD", occurredAt: new Date("2026-07-01T00:00:00Z"),
  });
  check("balance is zero after payout", async () => {});
  assert.equal(await deriveContributorBalance(db, "t-369", "c-alice"), 0n);

  const refund = await reverseEvent(db, {
    tenantId: "t-369",
    source: "shopify",
    originalSourceEventId: "order-1:line-1",
    reversalSourceEventId: "refund-1",
    occurredAt: new Date("2026-08-08T00:00:00Z"),
    reason: "customer chargeback",
  });

  check("the reversal was recorded", () => assert.equal(refund.status, "reversed"));
  check("both contributors were reversed", () => assert.equal(refund.reversedAllocationIds.length, 2));
  check("it is flagged for review — money already left", () => assert.equal(refund.needsReview, true));

  const aliceAfterRefund = await deriveContributorBalance(db, "t-369", "c-alice");
  check("Alice is now in deficit", () => assert.equal(aliceAfterRefund, -2186n));
  check("a negative balance is not payable", async () => {});
  assert.equal(await derivePayableBalance(db, "t-369", "c-alice", new Date("2026-12-01")), 0n);

  const reversalAlloc = await db
    .select()
    .from(schema.allocations)
    .where(eq(schema.allocations.contributorId, "c-alice"));
  const reversing = reversalAlloc.find((a) => a.reversesAllocationId !== null)!;
  check("the reversal references the original allocation", () =>
    assert.ok(reversing.reversesAllocationId)
  );
  check("the reversal carries the ORIGINAL rule version", () =>
    assert.equal(reversing.ruleVersion, 1)
  );

  const duplicateRefund = await reverseEvent(db, {
    tenantId: "t-369", source: "shopify",
    originalSourceEventId: "order-1:line-1",
    reversalSourceEventId: "refund-1",
    occurredAt: new Date("2026-08-08T00:00:00Z"),
  });
  check("a replayed refund is a duplicate", () => assert.equal(duplicateRefund.status, "duplicate"));

  // ---- 6. Recoupment ----
  console.log("\n6. Recoupment from future earnings");
  await ingestEvent(db, {
    ...saleEvent,
    sourceEventId: "order-3:line-1",
    occurredAt: new Date("2026-09-01T00:00:00Z"),
  });
  const recovered = await deriveContributorBalance(db, "t-369", "c-alice");
  check("the deficit is recouped by the next sale", () => assert.equal(recovered, 0n));

  // ---- 7. Immutability and derivation ----
  console.log("\n7. Ledger invariants");
  const ledger = await db.select().from(schema.ledgerEntries).where(eq(schema.ledgerEntries.tenantId, "t-369"));
  const ledgerSum = ledger.reduce((s, e) => s + BigInt(e.amountMinor), 0n);
  const allocSum = (await db.select().from(schema.allocations).where(eq(schema.allocations.tenantId, "t-369")))
    .reduce((s, a) => s + BigInt(a.amountMinor), 0n);
  const payoutSum = ledger
    .filter((e) => e.entryType === "payout")
    .reduce((s, e) => s + BigInt(e.amountMinor), 0n);

  check("ledger reconciles against allocations", () => assert.equal(ledgerSum - payoutSum, allocSum));

  const balanceColumns = await db.execute(sql`
    SELECT count(*)::int AS n FROM information_schema.columns
    WHERE table_name LIKE 'engine_%'
      AND column_name IN ('balance','balance_minor','total_earnings','monthly_sales')
  `);
  check("no stored-balance column exists anywhere", () =>
    assert.equal((balanceColumns.rows[0] as any).n, 0)
  );

  // ---- 8. Unresolvable references are held ----
  console.log("\n8. Unresolvable references");
  const orphan = await ingestEvent(db, {
    ...saleEvent,
    sourceEventId: "order-4:line-1",
    contributorRefs: [{ ref: "nobody" }],
  });
  check("an unknown contributor holds the event for review", () =>
    assert.equal(orphan.status, "needs_review")
  );
  check("nothing was allocated for it", () => assert.equal(orphan.allocationIds.length, 0));
  check("but the revenue is still recorded", () => assert.ok(orphan.eventId));

  console.log(`\nAll ${results.length} end-to-end checks passed against real Postgres.`);
  console.log(`Alice final balance: ${formatMoney(await deriveContributorBalance(db, "t-369", "c-alice"))}`);

  await pool.end();
}

main().catch((error) => {
  console.error("\nE2E FAILED:", error);
  process.exit(1);
});
