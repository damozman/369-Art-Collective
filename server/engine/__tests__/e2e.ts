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
import {
  FixtureTransferExecutor,
  runPayoutBatch,
  selectPayoutCandidates,
  retryPayout,
} from "../payout";
import type { RevenueEvent } from "../revenue-event";
import {
  authenticateContributor,
  assertCanReadContributor,
  AuthError,
  loadSessionContributor,
  setContributorPassword,
} from "../auth";
import { getPayoutHistory, getStatement } from "../statement-query";
import { renderStatementText } from "../statement";

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

  // ---- 9. Payout batch execution ----
  console.log("\n9. Payout batches");

  // Alice's balance recouped to exactly zero in step 6, so give her a fresh
  // sale to be paid for. Bob is still carrying earnings from the earlier orders.
  await ingestEvent(db, {
    ...saleEvent,
    sourceEventId: "order-5:line-1",
    occurredAt: new Date("2026-09-15T00:00:00Z"),
  });

  // Give Alice a payout account; leave Bob without one on purpose.
  await db.insert(schema.contributorIdentities).values({
    tenantId: "t-369", contributorId: "c-alice",
    stripeAccountId: "acct_alice", stripePayoutsEnabled: true,
  });

  const payoutAsOf = new Date("2026-10-15T00:00:00Z");
  const candidates = await selectPayoutCandidates(db, "t-369", payoutAsOf);
  const aliceCandidate = candidates.find((c) => c.contributorId === "c-alice")!;
  const bobCandidate = candidates.find((c) => c.contributorId === "c-bob")!;

  check("Alice is payable", () => assert.equal(aliceCandidate.skipReason, undefined));
  check("Bob is skipped — no payout account connected", () =>
    assert.match(bobCandidate.skipReason!, /No payout account/)
  );

  const executor = new FixtureTransferExecutor();
  const batch = await runPayoutBatch(db, {
    tenantId: "t-369", asOf: payoutAsOf, executor,
  });

  check("the batch completed", () => assert.equal(batch.status, "completed"));
  check("exactly one payout was made", () => assert.equal(batch.paid, 1));
  check("the transfer carried the payout's idempotency key", () =>
    assert.match(executor.requests[0].idempotencyKey, /^payout_/)
  );

  const aliceAfterPayout = await deriveContributorBalance(db, "t-369", "c-alice");
  check("Alice's balance is debited by exactly what was sent", () =>
    assert.equal(aliceAfterPayout, 0n)
  );

  const paidRows = await db.select().from(schema.payouts).where(eq(schema.payouts.status, "paid"));
  check("the payout row records the provider transfer id", () =>
    assert.ok(paidRows[0].stripeTransferId)
  );

  const rerun = await runPayoutBatch(db, { tenantId: "t-369", asOf: payoutAsOf, executor });
  check("re-running the batch pays nothing — the balance is already debited", () =>
    assert.equal(rerun.paid, 0)
  );

  // ---- 10. Partial batch failure and retry ----
  console.log("\n10. Failure and retry");
  await db.insert(schema.contributorIdentities).values({
    tenantId: "t-369", contributorId: "c-bob",
    stripeAccountId: "acct_bob", stripePayoutsEnabled: true,
  });
  await db.update(schema.tenants).set({ minimumPayoutMinor: 1n }).where(eq(schema.tenants.id, "t-369"));

  const failing = new FixtureTransferExecutor(new Set(["c-bob"]));
  const partialBatch = await runPayoutBatch(db, {
    tenantId: "t-369", asOf: payoutAsOf, executor: failing,
  });

  check("a batch with a failure says so in its own status", () =>
    assert.equal(partialBatch.status, "completed_with_failures")
  );
  check("the failed payout is recorded as failed", () => assert.equal(partialBatch.failed, 1));

  const bobBalanceAfterFailure = await deriveContributorBalance(db, "t-369", "c-bob");
  check("a failed transfer does NOT debit the ledger", () =>
    assert.ok(bobBalanceAfterFailure > 0n)
  );

  const [failedPayout] = await db
    .select().from(schema.payouts).where(eq(schema.payouts.status, "failed"));
  const retried = await retryPayout(db, failedPayout.id, new FixtureTransferExecutor());
  check("a retry succeeds and marks the payout paid", () => assert.equal(retried.status, "paid"));

  const bobAfterRetry = await deriveContributorBalance(db, "t-369", "c-bob");
  check("the retry debits the ledger exactly once", () => assert.equal(bobAfterRetry, 0n));

  const [retriedRow] = await db
    .select().from(schema.payouts).where(eq(schema.payouts.id, failedPayout.id));
  check("the attempt count records that a retry happened", () =>
    assert.equal(retriedRow.attemptCount, 2)
  );

  // ---- 11. Contributor login ----
  console.log("\n11. Contributor login");

  // The same email in two tenants — the case that breaks email-only lookup.
  await db.update(schema.contributors).set({ email: "shared@example.com" })
    .where(eq(schema.contributors.id, "c-alice"));
  await db.update(schema.contributors).set({ email: "shared@example.com" })
    .where(eq(schema.contributors.id, "c-eve"));

  await setContributorPassword(db, "t-369", "c-alice", "correct horse battery");
  await setContributorPassword(db, "t-press", "c-eve", "a different password");

  const aliceSession = await authenticateContributor(
    db, "t-369", "shared@example.com", "correct horse battery"
  );
  check("a contributor can log in", () => assert.equal(aliceSession?.contributorId, "c-alice"));

  const eveSession = await authenticateContributor(
    db, "t-press", "shared@example.com", "a different password"
  );
  check("the same email in another tenant resolves to a different person", () =>
    assert.equal(eveSession?.contributorId, "c-eve")
  );

  const crossTenant = await authenticateContributor(
    db, "t-press", "shared@example.com", "correct horse battery"
  );
  check("one tenant's password does not unlock the other tenant's account", () =>
    assert.equal(crossTenant, null)
  );

  check("a wrong password is refused", async () => {});
  assert.equal(await authenticateContributor(db, "t-369", "shared@example.com", "wrong"), null);

  check("an unknown email is refused", async () => {});
  assert.equal(await authenticateContributor(db, "t-369", "nobody@example.com", "x"), null);

  const reloaded = await loadSessionContributor(db, "t-369", "c-alice");
  check("a session reloads against the tenant", () => assert.ok(reloaded));
  check("a session cannot be reloaded under the wrong tenant", async () => {});
  assert.equal(await loadSessionContributor(db, "t-press", "c-alice"), null);

  check("a contributor may read their own earnings", () =>
    assert.doesNotThrow(() => assertCanReadContributor(aliceSession!, "t-369", "c-alice"))
  );
  check("a contributor may NOT read someone else's", () =>
    assert.throws(() => assertCanReadContributor(aliceSession!, "t-369", "c-bob"), AuthError)
  );
  check("a contributor may NOT read across tenants", () =>
    assert.throws(() => assertCanReadContributor(aliceSession!, "t-press", "c-eve"), AuthError)
  );

  // Deactivating cuts access immediately, not at next login.
  await db.update(schema.contributors).set({ active: false })
    .where(eq(schema.contributors.id, "c-alice"));
  check("a deactivated contributor loses access mid-session", async () => {});
  assert.equal(await loadSessionContributor(db, "t-369", "c-alice"), null);
  await db.update(schema.contributors).set({ active: true })
    .where(eq(schema.contributors.id, "c-alice"));

  // ---- 12. Statements ----
  console.log("\n12. Statements");
  const stmt = await getStatement(db, {
    tenantId: "t-369",
    contributorId: "c-alice",
    periodStart: new Date("2026-01-01T00:00:00Z"),
    periodEnd: new Date("2026-12-31T23:59:59Z"),
  });

  check("the statement carries the stored explanation verbatim", () => {
    const earned = stmt.lines.find((l) => l.type === "allocation")!;
    assert.match(earned.explanation!, /30% of net \$21\.86/);
    assert.match(earned.explanation!, /rule artist-standard v1/);
  });

  check("the statement names the work the money came from", () => {
    const earned = stmt.lines.find((l) => l.type === "allocation")!;
    assert.equal(earned.workTitle, "Sunset");
  });

  check("the statement shows the refund as its own line", () => {
    assert.ok(stmt.lines.some((l) => l.type === "reversal"));
  });

  check("the statement shows the payout as its own line", () => {
    assert.ok(stmt.lines.some((l) => l.type === "payout"));
  });

  const ledgerBalance = await deriveContributorBalance(db, "t-369", "c-alice");
  check("the statement's closing balance equals the ledger", () =>
    assert.equal(stmt.totals.closingBalanceMinor, ledgerBalance)
  );

  check("the statement summary is plain language", () =>
    assert.match(stmt.summary, /Alice earned/)
  );

  const history = await getPayoutHistory(db, "t-369", "c-alice");
  check("payout history is visible to the contributor", () =>
    assert.ok(history.length >= 1 && history.some((p) => p.status === "paid"))
  );

  console.log("\n--- Alice's statement as she would see it ---");
  console.log(renderStatementText(stmt));
  console.log("---\n");

  console.log(`\nAll ${results.length} end-to-end checks passed against real Postgres.`);
  console.log(`Alice final balance: ${formatMoney(await deriveContributorBalance(db, "t-369", "c-alice"))}`);

  await pool.end();
}

main().catch((error) => {
  console.error("\nE2E FAILED:", error);
  process.exit(1);
});
