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
import express from "express";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, inArray, sql } from "drizzle-orm";

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
import { authenticateTenantUser, createTenantUser } from "../admin-auth";
import { getOverview, listContributors, listNeedsReview, listRules } from "../admin-query";
import {
  AdminValidationError,
  createContributor,
  createRule,
  createWork,
  deactivateRule,
  supersedeRule,
  updateContributor,
} from "../admin-mutations";
import { isEffectiveAt } from "../rules";
import { dismissReview, resolveEventContributor, writeOffDeficit } from "../review";
import { renderStatementText } from "../statement";
import {
  ConnectionError,
  disconnectConnection,
  findConnectionByExternalRef,
  openCredential,
  openWebhookSecret,
  upsertConnection,
} from "../connections";
import { FixtureShopifyClient } from "../adapters/shopify/client";
import {
  ingestShopifyOrder,
  ingestShopifyRefund,
  readShopifySettings,
} from "../adapters/shopify/ingest";
import { createShopifyWebhookRouter } from "../adapters/shopify/routes";
import { signWebhookBody } from "../adapters/shopify/webhook-auth";
import { FixtureStripeClient } from "../adapters/stripe/client";
import {
  getPayoutAccount,
  handleAccountUpdated,
  PayoutAccountError,
  refreshPayoutAccount,
  startPayoutOnboarding,
} from "../payout-account";
import {
  discountedOrder,
  discountedOrderTransactions,
  fixtureOrders,
  fixtureTransactions,
  halfRefundOnDiscountedLine,
  partialRefund,
  paypalOrder,
  paypalOrderTransactions,
  refundForUnknownLine,
  testModeOrder,
  twoLineOrder,
  unattributableOrder,
} from "../adapters/shopify/__fixtures__/orders";

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

  // ---- 13. Admin console ----
  console.log("\n13. Admin console");

  await createTenantUser(db, {
    tenantId: "t-369", email: "owner@369.example", name: "Owner",
    password: "manage the money", role: "admin",
  });
  await createTenantUser(db, {
    tenantId: "t-369", email: "books@369.example", name: "Bookkeeper",
    password: "read only please", role: "viewer",
  });
  await createTenantUser(db, {
    tenantId: "t-press", email: "owner@press.example", name: "Press Owner",
    password: "different business", role: "admin",
  });

  const ownerSession = await authenticateTenantUser(
    db, "t-369", "369", "owner@369.example", "manage the money"
  );
  check("a tenant owner can sign in", () => assert.equal(ownerSession?.role, "admin"));

  const viewerSession = await authenticateTenantUser(
    db, "t-369", "369", "books@369.example", "read only please"
  );
  check("a read-only account signs in as viewer", () =>
    assert.equal(viewerSession?.role, "viewer")
  );

  const wrongTenantAdmin = await authenticateTenantUser(
    db, "t-press", "press", "owner@369.example", "manage the money"
  );
  check("an owner cannot sign in to another business", () =>
    assert.equal(wrongTenantAdmin, null)
  );

  const overview = await getOverview(db, "t-369", new Date("2026-12-01T00:00:00Z"));
  // Five $99 sales less one $99 refund. The reversal is itself an event with a
  // negative gross, so recorded sales are shown net of refunds — which is the
  // number an owner actually wants, not the pre-refund figure.
  check("the overview totals only this tenant's sales, net of refunds", () =>
    assert.equal(overview.grossMinor, 9900n * 4n)
  );
  // Two, and both are real: the sale with an unknown contributor, and the
  // chargeback that left Alice in deficit with the money already paid out.
  check("the overview counts everything needing a human", () =>
    assert.equal(overview.needsReviewCount, 2)
  );
  check("the overview counts this tenant's people only", () =>
    assert.equal(overview.contributorCount, 2)
  );

  const pressOverview = await getOverview(db, "t-press", new Date("2026-12-01T00:00:00Z"));
  check("the other business sees its own numbers", () =>
    assert.equal(pressOverview.grossMinor, 9900n)
  );

  const people = await listContributors(
    db, "t-369", new Date("2026-12-01T00:00:00Z"), 1000n
  );
  check("the people list covers this tenant only", () => assert.equal(people.length, 2));
  check("everyone's blocked reason is stated plainly", () =>
    assert.ok(people.every((p) => p.blockedReason === null || p.blockedReason.length > 0))
  );

  const review = await listNeedsReview(db, "t-369");
  check("the review queue lists both", () => assert.equal(review.length, 2));
  check("the unresolvable sale says why", () =>
    assert.ok(review.some((r) => /Unresolved contributor/.test(r.reviewReason ?? "")))
  );
  check("the unrecoverable chargeback says why", () =>
    assert.ok(review.some((r) => /already been paid out/.test(r.reviewReason ?? "")))
  );

  const adminRules = await listRules(db, "t-369");
  check("rules render as plain sentences", () => {
    const artistRule = adminRules.find((r) => r.ruleKey === "artist-standard")!;
    assert.match(artistRule.description, /earns 30% of profit/);
    assert.match(artistRule.description, /production, shipping, processing_fee/);
  });

  // ---- 14. Editing rates and people ----
  console.log("\n14. Editing rates and people");

  const newRuleId = await createRule(db, "t-369", {
    ruleKey: "poster-rate", scope: "product_type", scopeRef: "poster",
    basis: "net", method: "percent", percent: 25,
    costDeductions: ["production", "shipping"], priority: 5,
  });
  check("a new rate can be created", () => assert.ok(newRuleId));

  await assert.rejects(
    () => createRule(db, "t-369", {
      ruleKey: "poster-rate", scope: "tenant", basis: "net", method: "percent", percent: 40,
    }),
    AdminValidationError
  );
  check("creating a duplicate rate name is refused", async () => {});

  // The invariant that matters most: changing a rate must not rewrite history.
  const before = await listRules(db, "t-369");
  const originalArtistRule = before.find((r) => r.ruleKey === "artist-standard")!;

  const changed = await supersedeRule(db, "t-369", {
    ruleKey: "artist-standard", scope: "contributor", scopeRef: "c-alice",
    contributorId: "c-alice",
    basis: "net", method: "percent", percent: 40,
    costDeductions: ["production", "shipping", "processing_fee"], priority: 10,
  });
  check("changing a rate creates version 2", () => assert.equal(changed.version, 2));

  const after = await listRules(db, "t-369");
  const v1 = after.find((r) => r.ruleKey === "artist-standard" && r.version === 1)!;
  const v2 = after.find((r) => r.ruleKey === "artist-standard" && r.version === 2)!;

  check("version 1 still exists, unedited", () => {
    assert.equal(v1.id, originalArtistRule.id);
    assert.equal(v1.valueBasisPoints, 3000, "the old rate is untouched");
  });
  check("version 2 carries the new rate", () => assert.equal(v2.valueBasisPoints, 4000));
  check("version 1 was closed exactly where version 2 opens", () =>
    assert.equal(v1.effectiveTo?.getTime(), v2.effectiveFrom.getTime())
  );
  check("no gap and no overlap between versions", () => {
    const boundary = v2.effectiveFrom;
    const asRule = (r: typeof v1) => ({
      ...r, active: r.active, effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo,
    }) as any;
    assert.equal(isEffectiveAt(asRule(v1), new Date(boundary.getTime() - 1)), true);
    assert.equal(isEffectiveAt(asRule(v1), boundary), false, "old version ends at the boundary");
    assert.equal(isEffectiveAt(asRule(v2), boundary), true, "new version starts at it");
  });

  // The past payment is a snapshot and must be completely unaffected.
  const aliceAllocs = await db
    .select().from(schema.allocations)
    .where(eq(schema.allocations.contributorId, "c-alice"));
  check("payments already made still show the OLD rate", () =>
    assert.ok(aliceAllocs.every((a) => a.rateBasisPoints === 3000 || a.amountMinor < 0n))
  );

  await assert.rejects(
    () => supersedeRule(db, "t-369", {
      ruleKey: "artist-standard", scope: "tenant", basis: "net", method: "percent",
      percent: 50, effectiveFrom: new Date("2020-01-01"),
    }),
    /cannot start before/
  );
  check("backdating a change before the version it replaces is refused", async () => {});

  await assert.rejects(
    () => createRule(db, "t-369", {
      ruleKey: "bad-rate", scope: "tenant", basis: "net", method: "percent", percent: 150,
    }),
    /between 0 and 100/
  );
  check("an impossible percentage is refused", async () => {});

  await assert.rejects(
    () => createRule(db, "t-369", {
      ruleKey: "too-precise", scope: "tenant", basis: "net", method: "percent", percent: 30.005,
    }),
    /two decimal places/
  );
  check("a percentage finer than storage allows is refused", async () => {});

  await deactivateRule(db, "t-369", "poster-rate");
  const afterDeactivate = await listRules(db, "t-369");
  check("a deactivated rate stays on record rather than being deleted", () =>
    assert.ok(afterDeactivate.some((r) => r.ruleKey === "poster-rate" && !r.active))
  );

  // People
  const newPersonId = await createContributor(db, "t-369", {
    name: "Casey Kim", email: "casey@example.com", externalRef: "casey",
    password: "a good long password",
  });
  check("a person can be added", () => assert.ok(newPersonId));

  await assert.rejects(
    () => createContributor(db, "t-369", { name: "Impostor", externalRef: "casey" }),
    /References must be unique/
  );
  check("a duplicate reference is refused with a readable message", async () => {});

  const caseyLogin = await authenticateContributor(
    db, "t-369", "casey@example.com", "a good long password"
  );
  check("the person can sign in with the password that was set", () =>
    assert.equal(caseyLogin?.contributorId, newPersonId)
  );

  await updateContributor(db, "t-369", newPersonId, { name: "Casey Kim-Alvarez" });
  const updatedPeople = await listContributors(db, "t-369", new Date(), 1000n);
  check("editing a person's details works", () =>
    assert.ok(updatedPeople.some((p) => p.name === "Casey Kim-Alvarez"))
  );

  await assert.rejects(
    () => updateContributor(db, "t-press", newPersonId, { name: "Hijacked" }),
    /not in this business/
  );
  check("one business cannot edit another's people", async () => {});

  const workId = await createWork(db, "t-369", {
    title: "New Piece", externalRef: "art-999", productType: "poster",
  });
  check("a work can be added", () => assert.ok(workId));

  // ---- 15. Resolving review items ----
  console.log("\n15. Resolving review items");

  const stuck = (await listNeedsReview(db, "t-369")).find((r) =>
    /Unresolved contributor/.test(r.reviewReason ?? "")
  )!;
  check("the stuck sale is in the queue", () => assert.ok(stuck));

  // Assign to Alice deliberately: her rate was superseded to 40% in section 14
  // with an effective date of today, while this sale happened in June. If the
  // resolution used today's rate she would be paid 40%; she must get 30%.
  const balanceBefore = await deriveContributorBalance(db, "t-369", "c-alice");

  const resolved = await resolveEventContributor(db, {
    tenantId: "t-369", eventId: stuck.id, contributorId: "c-alice",
  });
  check("assigning it pays the person", () => assert.equal(resolved.status, "resolved"));
  check("money actually moved", () => assert.ok(resolved.totalAllocatedMinor > 0n));

  const balanceAfter = await deriveContributorBalance(db, "t-369", "c-alice");
  check("their balance went up by exactly what was allocated", () =>
    assert.equal(balanceAfter - balanceBefore, resolved.totalAllocatedMinor)
  );

  // The rate in force when the sale HAPPENED, not today's — artist-standard was
  // superseded to 40% in section 14, but this sale predates that.
  const resolvedAlloc = await db
    .select().from(schema.allocations)
    .where(eq(schema.allocations.revenueEventId, stuck.id));
  check("it paid the rate that applied on the sale date, not today's", () =>
    assert.equal(resolvedAlloc[0].rateBasisPoints, 3000)
  );

  check("it is out of the queue", async () => {});
  assert.ok(!(await listNeedsReview(db, "t-369")).some((r) => r.id === stuck.id));

  await assert.rejects(
    () => resolveEventContributor(db, {
      tenantId: "t-369", eventId: stuck.id, contributorId: "c-alice",
    }),
    /already been dealt with/
  );
  check("resolving the same item twice is refused — no double payment", async () => {});

  await assert.rejects(
    () => resolveEventContributor(db, {
      tenantId: "t-press", eventId: stuck.id, contributorId: "c-eve",
    }),
    /not in this business/
  );
  check("one business cannot resolve another's items", async () => {});

  // The unrecoverable chargeback: acknowledge rather than pay.
  const chargeback = (await listNeedsReview(db, "t-369")).find((r) =>
    /already been paid out/.test(r.reviewReason ?? "")
  )!;
  check("the chargeback is still in the queue", () => assert.ok(chargeback));

  await assert.rejects(
    () => dismissReview(db, { tenantId: "t-369", eventId: chargeback.id, note: "" }),
    /Say why/
  );
  check("dismissing without a reason is refused", async () => {});

  await dismissReview(db, {
    tenantId: "t-369", eventId: chargeback.id,
    note: "Absorbing this one; customer disputed in good faith",
  });
  check("it can be dismissed with a reason", async () => {});
  assert.ok(!(await listNeedsReview(db, "t-369")).some((r) => r.id === chargeback.id));

  const dismissedRow = await db
    .select().from(schema.revenueEvents)
    .where(eq(schema.revenueEvents.id, chargeback.id));
  check("the original reason is kept alongside the dismissal", () => {
    assert.match(dismissedRow[0].reviewReason!, /Absorbing this one/);
    assert.match(dismissedRow[0].reviewReason!, /was: /);
  });

  // Writing off a deficit.
  await db.insert(schema.ledgerEntries).values({
    tenantId: "t-369", contributorId: "c-alice", entryType: "reversal",
    amountMinor: -5000n, currency: "USD", occurredAt: new Date(),
  });
  const deficit = await deriveContributorBalance(db, "t-369", "c-alice");
  check("a contributor is in deficit", () => assert.ok(deficit < 0n));

  await writeOffDeficit(db, {
    tenantId: "t-369", contributorId: "c-alice",
    amountMinor: -deficit, note: "Written off after chargeback",
  });
  check("writing it off clears the balance to zero", async () => {});
  assert.equal(await deriveContributorBalance(db, "t-369", "c-alice"), 0n);

  const reversalStillThere = await db
    .select().from(schema.ledgerEntries)
    .where(and(
      eq(schema.ledgerEntries.contributorId, "c-alice"),
      eq(schema.ledgerEntries.entryType, "reversal")
    ));
  check("the original loss is still on the record — nothing was deleted", () =>
    assert.ok(reversalStillThere.length > 0)
  );

  const audit = await db
    .select().from(schema.auditLog)
    .where(eq(schema.auditLog.tenantId, "t-369"));
  check("every resolution is written to the audit log", () => {
    const actions = audit.map((a) => a.action);
    assert.ok(actions.includes("resolve_review"));
    assert.ok(actions.includes("dismiss_review"));
    assert.ok(actions.includes("write_off"));
  });

  // ============================================================
  // Connections and the Shopify adapter
  // ============================================================
  //
  // Everything below this line is the part unit tests cannot reach. The mapper
  // is proved exhaustively in `shopify-map.test.ts` with no database; what is
  // proved here is the half that needs one — sealing round-tripping through a
  // real column, the uniqueness constraint that routes a webhook to the right
  // tenant, and idempotency coming from Postgres rather than from a pre-check.

  console.log("\n-- connections and the Shopify adapter --");

  // A deterministic key so the run is repeatable. Production reads a real one
  // from the environment; a test that generated a fresh key each run could not
  // tell "sealing is broken" from "wrong key".
  process.env.ENGINE_SECRET_KEY ??= "e2e-only-passphrase-not-a-production-key";

  const SHOP = "369-e2e.myshopify.com";
  const WEBHOOK_SECRET = "shpss_e2e_secret";
  const ACCESS_TOKEN = "shpat_e2e_access_token";

  const connection = await upsertConnection(db, {
    tenantId: "t-369",
    provider: "shopify",
    externalRef: SHOP,
    label: SHOP,
    credential: ACCESS_TOKEN,
    webhookSecret: WEBHOOK_SECRET,
    settings: {
      attribution: { from: "sku", pattern: "^ART-(\\d+)-" },
      onUnknownFee: "hold",
    },
    status: "active",
  });

  check("a connection summary carries no secret material", () => {
    const serialised = JSON.stringify(connection);
    assert.ok(!serialised.includes(ACCESS_TOKEN));
    assert.ok(!serialised.includes(WEBHOOK_SECRET));
    assert.equal(connection.hasCredential, true);
    assert.equal(connection.hasWebhookSecret, true);
  });

  const storedRow = await db
    .select()
    .from(schema.sourceConnections)
    .where(eq(schema.sourceConnections.id, connection.id));

  check("the credential is ciphertext in the column, not plaintext", () => {
    assert.ok(storedRow[0].credentialSealed);
    assert.ok(!storedRow[0].credentialSealed!.includes(ACCESS_TOKEN));
    assert.match(storedRow[0].credentialSealed!, /^v1\./);
  });

  const routed = await findConnectionByExternalRef(db, "shopify", SHOP);
  check("a webhook's shop domain routes to the right tenant, and the token opens", () => {
    assert.ok(routed);
    assert.equal(routed!.tenantId, "t-369");
    assert.equal(openCredential(routed!), ACCESS_TOKEN);
    assert.equal(openWebhookSecret(routed!), WEBHOOK_SECRET);
  });

  let claimRejected = false;
  try {
    await upsertConnection(db, {
      tenantId: "t-press",
      provider: "shopify",
      externalRef: SHOP,
      credential: "shpat_someone_elses",
    });
  } catch (error) {
    claimRejected = error instanceof ConnectionError;
  }
  check("another tenant cannot claim a store that is already connected", () =>
    assert.equal(claimRejected, true)
  );

  // Updating a setting must not wipe the stored token as a side effect.
  await upsertConnection(db, {
    tenantId: "t-369",
    provider: "shopify",
    externalRef: SHOP,
    settings: { attribution: { from: "sku", pattern: "^ART-(\\d+)-" }, onUnknownFee: "hold" },
  });
  const afterSettingsUpdate = await findConnectionByExternalRef(db, "shopify", SHOP);
  check("changing a setting leaves the credential intact", () =>
    assert.equal(openCredential(afterSettingsUpdate!), ACCESS_TOKEN)
  );

  // ---- The works the fixture order's SKUs point at ----
  await db.insert(schema.works).values([
    { id: "w-1042", tenantId: "t-369", title: "Desert Bloom", externalRef: "1042", productType: "canvas" },
    { id: "w-2073", tenantId: "t-369", title: "Night Arroyo", externalRef: "2073", productType: "print" },
  ]);
  await db.insert(schema.workContributors).values([
    { tenantId: "t-369", workId: "w-1042", contributorId: "c-alice", role: "artist" },
    { tenantId: "t-369", workId: "w-1042", contributorId: "c-bob", role: "producer" },
    { tenantId: "t-369", workId: "w-2073", contributorId: "c-alice", role: "artist" },
  ]);

  const shopifyConfig = readShopifySettings(
    afterSettingsUpdate!.settings as Record<string, unknown> | null
  );
  check("settings round-trip out of jsonb", () => {
    assert.equal(shopifyConfig.attribution.from, "sku");
    assert.equal(shopifyConfig.attribution.pattern, "^ART-(\\d+)-");
    assert.equal(shopifyConfig.onUnknownFee, "hold");
  });

  const shopifyClient = new FixtureShopifyClient({
    orders: fixtureOrders,
    transactions: fixtureTransactions,
  });

  const orderResult = await ingestShopifyOrder(db, twoLineOrder, {
    tenantId: "t-369",
    config: shopifyConfig,
    client: shopifyClient,
  });

  check("a two-line Shopify order ingests as two separately-keyed events", () => {
    assert.equal(
      orderResult.ingested,
      2,
      orderResult.lines.map((l) => `${l.sourceEventId}=${l.status}:${l.reason ?? ""}`).join(" | ")
    );
    assert.equal(orderResult.heldForReview, 0);
    assert.deepEqual(
      orderResult.lines.map((l) => l.sourceEventId).sort(),
      ["5001000001:12001", "5001000001:12002"]
    );
  });

  const ingestedEvents = await db
    .select()
    .from(schema.revenueEvents)
    .where(
      and(
        eq(schema.revenueEvents.tenantId, "t-369"),
        inArray(schema.revenueEvents.sourceEventId, [
          "5001000001:12001",
          "5001000001:12002",
        ])
      )
    );

  check("both lines were stored with their own gross, not the order total", () => {
    const byId = new Map(ingestedEvents.map((e) => [e.sourceEventId, BigInt(e.grossAmountMinor)]));
    assert.equal(byId.get("5001000001:12001"), 7800n);
    assert.equal(byId.get("5001000001:12002"), 4000n);
  });

  const storedFees = await db
    .select()
    .from(schema.costComponents)
    .where(
      and(
        eq(schema.costComponents.tenantId, "t-369"),
        inArray(
          schema.costComponents.revenueEventId,
          ingestedEvents.map((e) => e.id)
        )
      )
    );

  check("the real payment fee was apportioned and stored, summing to exactly the fee", () => {
    const fees = storedFees.filter((c) => c.type === "processing_fee");
    assert.equal(fees.length, 2);
    assert.equal(
      fees.reduce((sum, f) => sum + BigInt(f.amountMinor), 0n),
      429n
    );
    assert.ok(fees.every((f) => f.source === "shopify_transactions"));
  });

  const redelivered = await ingestShopifyOrder(db, twoLineOrder, {
    tenantId: "t-369",
    config: shopifyConfig,
    client: shopifyClient,
  });
  check("a re-delivered webhook is a no-op, caught by the database not a pre-check", () => {
    assert.equal(redelivered.duplicates, 2);
    assert.equal(redelivered.ingested, 0);
  });

  // The unattributable line: revenue recorded, nobody paid, visible for review.
  const unattributable = await ingestShopifyOrder(db, unattributableOrder, {
    tenantId: "t-369",
    config: { ...shopifyConfig, onUnknownFee: "proceed" },
    client: shopifyClient,
  });
  check("a line with no recognisable work is held, not dropped and not guessed at", () => {
    assert.equal(unattributable.heldForReview, 1);
    assert.equal(unattributable.ingested, 0);
  });

  const heldQueue = await listNeedsReview(db, "t-369");
  check("the held line appears in the owner's review queue", () =>
    assert.ok(heldQueue.some((r) => r.sourceEventId === "5001000004:12030"))
  );

  const heldAllocations = await db
    .select()
    .from(schema.allocations)
    .where(eq(schema.allocations.revenueEventId, unattributable.lines[0].eventId!));
  check("nothing was allocated from the held line", () =>
    assert.equal(heldAllocations.length, 0)
  );

  // A missing fee under `actual` holds even when attribution succeeds.
  const feelessResult = await ingestShopifyOrder(db, paypalOrder, {
    tenantId: "t-369",
    config: shopifyConfig,
    client: shopifyClient,
    transactions: paypalOrderTransactions,
  });
  check("an unknown payment fee holds the line rather than assuming zero", () => {
    assert.equal(feelessResult.heldForReview, 1);
    assert.match(feelessResult.lines[0].reason ?? "", /fee/i);
  });

  const testOrderResult = await ingestShopifyOrder(db, testModeOrder, {
    tenantId: "t-369",
    config: shopifyConfig,
    client: shopifyClient,
  });
  check("a Shopify test order creates nothing at all", () => {
    assert.equal(testOrderResult.ingested, 0);
    assert.equal(testOrderResult.heldForReview, 0);
    assert.equal(testOrderResult.skipped, 2);
  });

  // ---- Refund through the real reversal path ----
  const balanceBeforeRefund = await deriveContributorBalance(db, "t-369", "c-alice");

  const refundResult = await ingestShopifyRefund(db, partialRefund, {
    tenantId: "t-369",
    currency: "USD",
  });
  check("a Shopify refund reverses the original allocation", () => {
    assert.equal(refundResult.reversals.length, 1);
    assert.equal(refundResult.reversals[0].status, "reversed");
    assert.ok(refundResult.totalContributorImpactMinor !== 0n);
  });

  const balanceAfterRefund = await deriveContributorBalance(db, "t-369", "c-alice");
  check("the refund reduced the contributor's derived balance", () =>
    assert.ok(balanceAfterRefund < balanceBeforeRefund)
  );

  const replayedRefund = await ingestShopifyRefund(db, partialRefund, {
    tenantId: "t-369",
    currency: "USD",
  });
  const balanceAfterReplay = await deriveContributorBalance(db, "t-369", "c-alice");
  check("a re-delivered refund does not claw back twice", () => {
    assert.ok(
      replayedRefund.reversals.every((r) => r.status !== "reversed"),
      replayedRefund.reversals.map((r) => `${r.sourceEventId}=${r.status}`).join(" | ")
    );
    assert.equal(balanceAfterReplay, balanceAfterRefund);
  });

  const orphanRefund = await ingestShopifyRefund(db, refundForUnknownLine, {
    tenantId: "t-369",
    currency: "USD",
  });
  check("a refund naming a line we never saw is reported, not crashed on", () => {
    assert.equal(orphanRefund.reversals[0].status, "unmatched");
    assert.equal(orphanRefund.needsReview.length, 1);
  });

  // ---- Cross-tenant isolation on the adapter path ----
  const wrongTenant = await ingestShopifyOrder(db, discountedOrder, {
    tenantId: "t-press",
    config: shopifyConfig,
    client: shopifyClient,
    transactions: discountedOrderTransactions,
  });
  check("the same order ingested for another tenant matches none of 369's works", () => {
    assert.equal(wrongTenant.ingested, 0);
    assert.equal(wrongTenant.heldForReview, 2);
  });

  // ============================================================
  // The webhook endpoint, over real HTTP
  // ============================================================
  //
  // The adapter is proved above by calling it directly. This proves the thing
  // in front of it: that a signed delivery arriving over HTTP reaches the
  // ledger, and that an unsigned one does not. The dependency worth testing for
  // real is the raw body — `verifyShopifyWebhook` needs the exact bytes Shopify
  // sent, and `express.json` hands back a parsed object. If the `verify` hook
  // in `server/index.ts` ever stops populating `req.rawBody`, every legitimate
  // delivery fails signature verification, and nothing but this catches it.

  console.log("\n-- the webhook endpoint over HTTP --");

  // A second store, so the uninstall below revokes this one rather than the
  // connection the direct-call checks above are still using.
  const SHOP_HTTP = "369-http.myshopify.com";
  await upsertConnection(db, {
    tenantId: "t-369",
    provider: "shopify",
    externalRef: SHOP_HTTP,
    label: SHOP_HTTP,
    credential: "shpat_http_access_token",
    webhookSecret: WEBHOOK_SECRET,
    settings: {
      attribution: { from: "sku", pattern: "^ART-(\\d+)-" },
      onUnknownFee: "hold",
    },
    status: "active",
  });

  const webhookApp = express();
  webhookApp.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as unknown as { rawBody: Buffer }).rawBody = buf;
      },
    })
  );
  webhookApp.use(
    "/api/engine",
    createShopifyWebhookRouter(db, {
      clientFor: () =>
        new FixtureShopifyClient({ orders: fixtureOrders, transactions: fixtureTransactions }),
    })
  );

  const server = await new Promise<import("node:http").Server>((resolve) => {
    const s = webhookApp.listen(0, () => resolve(s));
  });
  const port = (server.address() as { port: number }).port;
  const webhookUrl = `http://127.0.0.1:${port}/api/engine/webhooks/shopify`;

  async function deliver(
    topic: string,
    payload: unknown,
    options: { secret?: string | null; shop?: string } = {}
  ) {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-shopify-topic": topic,
      "x-shopify-shop-domain": options.shop ?? SHOP_HTTP,
    };
    if (options.secret !== null) {
      headers["x-shopify-hmac-sha256"] = signWebhookBody(
        body,
        options.secret ?? WEBHOOK_SECRET
      );
    }
    const response = await fetch(webhookUrl, { method: "POST", headers, body });
    return {
      status: response.status,
      body: (await response.json().catch(() => ({}))) as Record<string, unknown>,
    };
  }

  const unsigned = await deliver("orders/paid", discountedOrder, { secret: null });
  check("an unsigned delivery is rejected", () => assert.equal(unsigned.status, 401));

  const wrongSignature = await deliver("orders/paid", discountedOrder, {
    secret: "the-wrong-secret",
  });
  check("a wrongly-signed delivery is rejected", () =>
    assert.equal(wrongSignature.status, 401)
  );

  const unknownShop = await deliver("orders/paid", discountedOrder, {
    shop: "not-connected.myshopify.com",
  });
  check("a delivery from a store we have no connection to is rejected", () =>
    assert.equal(unknownShop.status, 401)
  );

  const nothingWritten = await db
    .select()
    .from(schema.revenueEvents)
    .where(
      and(
        eq(schema.revenueEvents.tenantId, "t-369"),
        eq(schema.revenueEvents.sourceEventId, "5001000002:12010")
      )
    );
  check("no rejected delivery wrote anything to the ledger", () =>
    assert.equal(nothingWritten.length, 0)
  );

  const accepted = await deliver("orders/paid", discountedOrder);
  check("a correctly signed order is accepted and ingested over HTTP", () => {
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.ingested, 2);
  });

  const httpEvents = await db
    .select()
    .from(schema.revenueEvents)
    .where(
      and(
        eq(schema.revenueEvents.tenantId, "t-369"),
        eq(schema.revenueEvents.sourceEventId, "5001000002:12010")
      )
    );
  check("the discounted line was stored net of its cart-level discount", () =>
    // $78.00 list, $7.80 code. Reading `total_discount` would have stored 7800.
    assert.equal(BigInt(httpEvents[0].grossAmountMinor), 7020n)
  );

  const redeliveredOverHttp = await deliver("orders/paid", discountedOrder);
  check("Shopify re-delivering the same order changes nothing", () => {
    assert.equal(redeliveredOverHttp.status, 200);
    assert.equal(redeliveredOverHttp.body.duplicates, 2);
    assert.equal(redeliveredOverHttp.body.ingested, 0);
  });

  const unhandled = await deliver("orders/fulfilled", discountedOrder);
  check("an unhandled topic is acknowledged so Shopify stops retrying it", () => {
    assert.equal(unhandled.status, 200);
    assert.equal(unhandled.body.ignored, "orders/fulfilled");
  });

  const refundOverHttp = await deliver("refunds/create", halfRefundOnDiscountedLine);
  check("a refund delivered over HTTP reverses the sale", () => {
    assert.equal(refundOverHttp.status, 200);
    assert.equal(refundOverHttp.body.reversed, 1);
  });

  const uninstall = await deliver("app/uninstalled", { shop_domain: SHOP_HTTP });
  check("an uninstall disconnects the store", () => {
    assert.equal(uninstall.status, 200);
    assert.equal(uninstall.body.disconnected, true);
  });

  const afterUninstall = await findConnectionByExternalRef(db, "shopify", SHOP_HTTP);
  check("the uninstalled store's token is destroyed, not orphaned", () => {
    assert.equal(afterUninstall!.status, "revoked");
    assert.equal(afterUninstall!.credentialSealed, null);
  });

  await new Promise<void>((resolve) => server.close(() => resolve()));

  // ============================================================
  // Connecting a contributor's bank account
  // ============================================================
  //
  // The properties that decide whether somebody actually gets paid: exactly one
  // Stripe account per person however many times they start the flow, and
  // `payoutsEnabled` set from Stripe alone.

  console.log("\n-- payout account onboarding --");

  const stripe = new FixtureStripeClient();

  // A contributor with earnings but no payout account — the state everyone is
  // in on day one, and the reason this screen exists.
  await db.insert(schema.contributors).values({
    id: "c-carol", tenantId: "t-369", name: "Carol", email: "carol@example.com",
    externalRef: "carol",
  });
  await db.insert(schema.ledgerEntries).values({
    tenantId: "t-369", contributorId: "c-carol", entryType: "allocation",
    amountMinor: 5000n, currency: "USD", availableAt: null, occurredAt: new Date(),
  });

  const carolBefore = await getPayoutAccount(db, "t-369", "c-carol");
  check("a contributor with no payout account is 'not started'", () => {
    assert.equal(carolBefore.state, "not_started");
    assert.equal(carolBefore.canReceivePayouts, false);
  });

  const unpayable = await selectPayoutCandidates(db, "t-369", new Date());
  check("they are owed money and a payout run cannot pay them", () => {
    const carol = unpayable.find((c) => c.contributorId === "c-carol");
    assert.equal(carol?.payableMinor, 5000n);
    assert.equal(carol?.skipReason, "No payout account connected");
  });

  const firstLink = await startPayoutOnboarding(db, {
    tenantId: "t-369",
    contributorId: "c-carol",
    client: stripe,
    returnUrl: "https://app.example.com/portal/369?payouts=returned",
    refreshUrl: "https://app.example.com/portal/369?payouts=expired",
  });
  check("starting onboarding creates an account and returns a link", () => {
    assert.equal(firstLink.created, true);
    assert.ok(firstLink.url.startsWith("https://connect.stripe.com/"));
    assert.equal(stripe.createdAccounts.length, 1);
  });

  const secondLink = await startPayoutOnboarding(db, {
    tenantId: "t-369",
    contributorId: "c-carol",
    client: stripe,
    returnUrl: "https://app.example.com/portal/369?payouts=returned",
    refreshUrl: "https://app.example.com/portal/369?payouts=expired",
  });
  check("starting again reuses the account and mints a fresh link", () => {
    // Creating a second would orphan the first — and if the first was the one
    // that got verified, payouts go somewhere the person cannot withdraw from.
    assert.equal(secondLink.created, false);
    assert.equal(stripe.createdAccounts.length, 1);
    assert.equal(stripe.accountLinks.length, 2);
  });

  const identityRows = await db
    .select()
    .from(schema.contributorIdentities)
    .where(eq(schema.contributorIdentities.contributorId, "c-carol"));
  check("exactly one identity row exists, carrying the Stripe account", () => {
    assert.equal(identityRows.length, 1);
    assert.ok(identityRows[0].stripeAccountId?.startsWith("acct_fixture_"));
    assert.equal(identityRows[0].stripePayoutsEnabled, false);
  });

  const carolAccountId = identityRows[0].stripeAccountId!;

  const afterOnboarding = await refreshPayoutAccount(db, {
    tenantId: "t-369",
    contributorId: "c-carol",
    client: stripe,
  });
  check("finishing the form does NOT make an account ready", () => {
    assert.equal(afterOnboarding.state, "pending");
    assert.equal(afterOnboarding.canReceivePayouts, false);
    assert.ok(afterOnboarding.outstanding.length > 0);
  });

  const stillBlocked = await selectPayoutCandidates(db, "t-369", new Date());
  check("a payout run still skips them while Stripe has not enabled payouts", () => {
    const carol = stillBlocked.find((c) => c.contributorId === "c-carol");
    assert.ok(carol?.skipReason, "carol must be skipped");
    assert.match(carol!.skipReason!, /not enabled/);
  });

  // Stripe approves, the way it does after reviewing documents.
  stripe.setAccountStatus(carolAccountId, {
    payoutsEnabled: true,
    chargesEnabled: true,
    detailsSubmitted: true,
    currentlyDue: [],
    disabledReason: null,
  });

  const approved = await refreshPayoutAccount(db, {
    tenantId: "t-369",
    contributorId: "c-carol",
    client: stripe,
  });
  check("once Stripe enables payouts the account reads as ready", () => {
    assert.equal(approved.state, "ready");
    assert.equal(approved.canReceivePayouts, true);
    assert.deepEqual(approved.outstanding, []);
  });

  const nowEligible = await selectPayoutCandidates(db, "t-369", new Date());
  check("the payout run now stops skipping them for a missing account", () => {
    const carol = nowEligible.find((c) => c.contributorId === "c-carol");
    assert.ok(carol);
    assert.equal(carol!.skipReason, undefined);
  });

  // Stripe suspends the account later — the case a one-time flag would miss.
  stripe.setAccountStatus(carolAccountId, {
    payoutsEnabled: false,
    detailsSubmitted: true,
    currentlyDue: ["individual.verification.additional_document"],
    disabledReason: "requirements.past_due",
  });

  const suspendedViaWebhook = await handleAccountUpdated(
    db,
    await stripe.getAccountStatus(carolAccountId)
  );
  check("an account.updated webhook finds the right contributor", () => {
    assert.deepEqual(suspendedViaWebhook, { tenantId: "t-369", contributorId: "c-carol" });
  });

  const suspended = await getPayoutAccount(db, "t-369", "c-carol");
  check("a later suspension is reflected without anyone signing in", () => {
    assert.equal(suspended.state, "restricted");
    assert.equal(suspended.canReceivePayouts, false);
  });

  const blockedAgain = await selectPayoutCandidates(db, "t-369", new Date());
  check("the payout run skips them again", () => {
    const carol = blockedAgain.find((c) => c.contributorId === "c-carol");
    assert.match(carol?.skipReason ?? "", /not enabled/);
  });

  const unknownAccount = await handleAccountUpdated(db, {
    id: "acct_someone_elses_platform",
    payoutsEnabled: true,
    chargesEnabled: true,
    detailsSubmitted: true,
    currentlyDue: [],
    disabledReason: null,
  });
  check("an account.updated for an account that is not ours is ignored", () =>
    assert.equal(unknownAccount, null)
  );

  let refusedUnknownContributor = false;
  try {
    await startPayoutOnboarding(db, {
      tenantId: "t-369",
      contributorId: "c-eve", // belongs to t-press
      client: stripe,
      returnUrl: "https://app.example.com/x",
      refreshUrl: "https://app.example.com/y",
    });
  } catch (error) {
    refusedUnknownContributor = error instanceof PayoutAccountError;
  }
  check("one business cannot start onboarding for another's contributor", () =>
    assert.equal(refusedUnknownContributor, true)
  );

  // Needs someone with NO account yet — country is only read when creating one,
  // because Stripe cannot change it afterwards.
  await db.insert(schema.contributors).values({
    id: "c-dan", tenantId: "t-369", name: "Dan", externalRef: "dan",
  });

  let refusedBadCountry = false;
  try {
    await startPayoutOnboarding(db, {
      tenantId: "t-369",
      contributorId: "c-dan",
      client: stripe,
      returnUrl: "https://app.example.com/x",
      refreshUrl: "https://app.example.com/y",
      country: "United States",
    });
  } catch (error) {
    refusedBadCountry = error instanceof PayoutAccountError;
  }
  check("a malformed country is refused — Stripe cannot change it later", () =>
    assert.equal(refusedBadCountry, true)
  );

  // ---- Disconnection destroys the credential ----
  await disconnectConnection(db, connection.id, "revoked");
  const afterDisconnect = await findConnectionByExternalRef(db, "shopify", SHOP);
  check("uninstalling destroys the stored token rather than orphaning it", () => {
    assert.equal(afterDisconnect!.status, "revoked");
    assert.equal(afterDisconnect!.credentialSealed, null);
    assert.equal(afterDisconnect!.webhookSecretSealed, null);
  });

  console.log(`\nAll ${results.length} end-to-end checks passed against real Postgres.`);
  console.log(`Alice final balance: ${formatMoney(await deriveContributorBalance(db, "t-369", "c-alice"))}`);

  await pool.end();
}

main().catch((error) => {
  console.error("\nE2E FAILED:", error);
  process.exit(1);
});
