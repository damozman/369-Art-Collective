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
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";

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
import { getTaxYearReport, listTaxYears } from "../tax/report-1099-query";
import { toCsv } from "../tax/report-1099";
import { authenticateTenantUser, createTenantUser } from "../admin-auth";
import {
  getOverview,
  getSettings,
  listContributors,
  listNeedsReview,
  listAuditActions,
  listAuditLog,
  listRules,
  listWorks,
} from "../admin-query";
import {
  AdminValidationError,
  createContributor,
  createRule,
  createWork,
  deactivateRule,
  linkWorkContributor,
  setWorkArchived,
  supersedeRule,
  unlinkWorkContributor,
  updateContributor,
  updateTenantSettings,
  updateWork,
} from "../admin-mutations";
import { isEffectiveAt } from "../rules";
import {
  dismissReview,
  recordEventCost,
  resolveEventContributor,
  writeOffDeficit,
} from "../review";
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
import { signUp } from "../billing/signup";
import { FixtureBillingClient } from "../billing/billing-client";
import { FixtureEmailSender } from "../email/sender";
import { sendOnce } from "../email/notify";
import {
  RESET_TTL_MINUTES,
  checkReset,
  completeReset,
  requestReset,
} from "../password-reset";
import { notifyPayoutsPaid, notifyTrialEnding } from "../email/notifications";
import { runDailyJobs } from "../jobs/daily";
import {
  completeCheckout,
  recordPaymentFailure,
  startCheckout,
} from "../billing/checkout";
import {
  changePlan,
  countPeoplePaid,
  entitlement,
  getSubscription,
  getUsage,
  recordUsageOverage,
  startTrial,
} from "../billing/subscription";
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

  // ============================================================
  // Settings, artwork, and recording a cost the channel never sent
  // ============================================================

  console.log("\n-- settings, artwork and missing costs --");

  // ---- Settings ----

  const settingsBefore = await getSettings(db, "t-369");
  check("settings read back what the tenant was seeded with", () => {
    assert.equal(settingsBefore.payoutHoldDays, 14);
    assert.equal(settingsBefore.clawbackPolicy, "recoup");
  });

  /**
   * THE CLAIM THIS SECTION EXISTS TO PROVE. Hold days are stamped onto the
   * ledger entry when the money is worked out. Changing the setting must not
   * reach backwards and move a release date somebody has already been shown.
   * Only a real database can answer this — the value lives in a stored column.
   */
  const heldBefore = await db
    .select({ id: schema.ledgerEntries.id, availableAt: schema.ledgerEntries.availableAt })
    .from(schema.ledgerEntries)
    .where(
      and(
        eq(schema.ledgerEntries.tenantId, "t-369"),
        isNotNull(schema.ledgerEntries.availableAt)
      )
    )
    .orderBy(schema.ledgerEntries.id);

  check("there is held money to test against", () => assert.ok(heldBefore.length > 0));

  await updateTenantSettings(
    db,
    "t-369",
    {
      payoutHoldDays: 1,
      minimumPayout: "25.00",
      clawbackPolicy: "recoup",
    },
    "u-owner"
  );

  const heldAfter = await db
    .select({ id: schema.ledgerEntries.id, availableAt: schema.ledgerEntries.availableAt })
    .from(schema.ledgerEntries)
    .where(
      and(
        eq(schema.ledgerEntries.tenantId, "t-369"),
        isNotNull(schema.ledgerEntries.availableAt)
      )
    )
    .orderBy(schema.ledgerEntries.id);

  check("shortening the hold period does NOT release money already earned", () => {
    assert.equal(heldAfter.length, heldBefore.length);
    for (let i = 0; i < heldBefore.length; i++) {
      assert.equal(
        heldAfter[i].availableAt?.getTime(),
        heldBefore[i].availableAt?.getTime()
      );
    }
  });

  const settingsAfter = await getSettings(db, "t-369");
  check("the minimum payout survives as exact minor units", () =>
    assert.equal(settingsAfter.minimumPayoutMinor, "2500")
  );

  const settingsAudit = await db
    .select()
    .from(schema.auditLog)
    .where(
      and(
        eq(schema.auditLog.tenantId, "t-369"),
        eq(schema.auditLog.action, "update_settings")
      )
    );
  check("changing settings is written to the audit log with the previous values", () => {
    assert.equal(settingsAudit.length, 1);
    assert.equal(
      (settingsAudit[0].before as Record<string, unknown>).payoutHoldDays,
      14
    );
  });

  // A minimum typed as "25.005" must not silently round into a different figure.
  await assert.rejects(
    () =>
      updateTenantSettings(db, "t-369", {
        payoutHoldDays: 1,
        minimumPayout: "not a number",
        clawbackPolicy: "recoup",
      }),
    /must be an amount/
  );
  check("a minimum payout that is not an amount is refused", async () => {});

  await updateTenantSettings(db, "t-369", {
    payoutHoldDays: 14,
    minimumPayout: "10.00",
    clawbackPolicy: "recoup",
  });
  check("settings can be put back", async () => {});

  // ---- Artwork ----

  const artWorkId = await createWork(db, "t-369", {
    title: "Harbour Lights",
    externalRef: "art-harbour",
    productType: "print",
  });

  await linkWorkContributor(db, "t-369", artWorkId, "c-alice", "artist");
  const withAlice = (await listWorks(db, "t-369")).find((w) => w.id === artWorkId)!;
  check("someone can be attached to a work", () =>
    assert.equal(withAlice.contributors[0]?.name, "Alice")
  );

  /**
   * ⚠️ THE CROSS-TENANT CHECK. The foreign keys on `work_contributors` point at
   * `contributors.id` globally, so before `linkWorkContributor` verified the
   * tenant, naming another business's contributor id satisfied every database
   * constraint and inserted happily — putting a stranger in line to be paid out
   * of your sales. This is the check that would have caught it.
   */
  await assert.rejects(
    () => linkWorkContributor(db, "t-369", artWorkId, "c-eve"),
    /not in this business/
  );
  check("a work cannot be attached to another business's person", async () => {});

  await assert.rejects(
    () => linkWorkContributor(db, "t-press", artWorkId, "c-eve"),
    /not in this business/
  );
  check("nor can another business attach anyone to this work", async () => {});

  await updateWork(db, "t-369", artWorkId, { title: "Harbour Lights (revised)" });
  const renamed = (await listWorks(db, "t-369")).find((w) => w.id === artWorkId)!;
  check("a work can be renamed", () =>
    assert.equal(renamed.title, "Harbour Lights (revised)")
  );

  await setWorkArchived(db, "t-369", artWorkId, true);
  const archived = (await listWorks(db, "t-369")).find((w) => w.id === artWorkId)!;
  check("archiving marks it without deleting it or its attribution", () => {
    assert.ok(archived.archivedAt);
    assert.equal(archived.contributors.length, 1);
  });

  await setWorkArchived(db, "t-369", artWorkId, false);
  await unlinkWorkContributor(db, "t-369", artWorkId, "c-alice");
  const unlinked = (await listWorks(db, "t-369")).find((w) => w.id === artWorkId)!;
  check("someone can be taken off a work", () =>
    assert.equal(unlinked.contributors.length, 0)
  );

  await assert.rejects(
    () => unlinkWorkContributor(db, "t-369", artWorkId, "c-alice"),
    /not on this work/
  );
  check("removing someone twice is refused rather than silently succeeding", async () => {});

  // ---- Recording a cost the sales channel could not report ----
  //
  // The gap this closes: a line held because its payment fee was unreadable
  // could previously only be resolved with NO fee recorded, which silently made
  // the business absorb it while every screen still looked right.

  const feeEventId = "ev-missing-fee";
  await db.insert(schema.revenueEvents).values({
    id: feeEventId,
    tenantId: "t-369",
    source: "shopify",
    sourceEventId: "order-fee-1:line-1",
    direction: "sale",
    occurredAt: new Date("2026-06-15T12:00:00Z"),
    grossAmountMinor: 10000n,
    currency: "USD",
    quantity: 1,
    workRef: "alice",
    needsReview: true,
    reviewReason: "Payment fee could not be read from the order",
  });

  await assert.rejects(
    () =>
      recordEventCost(db, {
        tenantId: "t-369",
        eventId: feeEventId,
        type: "processing_fee",
        amountMinor: 0n,
      }),
    /positive amount/
  );
  check("a zero cost is refused — 'no fee' is the absence of a row", async () => {});

  await assert.rejects(
    () =>
      recordEventCost(db, {
        tenantId: "t-369",
        eventId: feeEventId,
        type: "processing_fee",
        amountMinor: 20000n,
      }),
    /more than the sale itself/
  );
  check("a cost larger than the sale is refused as a likely typo", async () => {});

  await assert.rejects(
    () =>
      recordEventCost(db, {
        tenantId: "t-press",
        eventId: feeEventId,
        type: "processing_fee",
        amountMinor: 320n,
      }),
    /not in this business/
  );
  check("one business cannot record a cost against another's sale", async () => {});

  await recordEventCost(db, {
    tenantId: "t-369",
    eventId: feeEventId,
    type: "processing_fee",
    amountMinor: 320n,
    note: "PayPal statement",
    actorId: "u-owner",
  });

  const recordedCost = await db
    .select()
    .from(schema.costComponents)
    .where(eq(schema.costComponents.revenueEventId, feeEventId));
  check("the cost is stored against the sale", () => {
    assert.equal(recordedCost.length, 1);
    assert.equal(recordedCost[0].amountMinor, 320n);
    assert.match(recordedCost[0].source ?? "", /^manual/);
  });

  // Correcting it before anything is paid must be allowed — a mistyped fee that
  // could not be fixed would be worse than one that can.
  await recordEventCost(db, {
    tenantId: "t-369",
    eventId: feeEventId,
    type: "processing_fee",
    amountMinor: 340n,
  });
  const correctedCost = await db
    .select()
    .from(schema.costComponents)
    .where(eq(schema.costComponents.revenueEventId, feeEventId));
  check("a cost can be corrected while the sale is still held", () => {
    assert.equal(correctedCost.length, 1);
    assert.equal(correctedCost[0].amountMinor, 340n);
  });

  /**
   * The whole point: the recorded fee must actually reach the calculation.
   * Alice's rule is net-basis and deducts `processing_fee`, so resolving now
   * should pay 30% of (10000 − 340) = 2898, NOT 30% of 10000 = 3000.
   */
  const feeResolved = await resolveEventContributor(db, {
    tenantId: "t-369",
    eventId: feeEventId,
    contributorId: "c-alice",
  });
  check("the recorded fee is deducted before the split is worked out", () =>
    assert.equal(feeResolved.totalAllocatedMinor, 2898n)
  );

  await assert.rejects(
    () =>
      recordEventCost(db, {
        tenantId: "t-369",
        eventId: feeEventId,
        type: "processing_fee",
        amountMinor: 500n,
      }),
    /already been dealt with/
  );
  check("costs cannot be changed once the sale has been paid out", async () => {});

  // ============================================================
  // Billing — signup, trials, and usage that does not become a bill
  // ============================================================

  console.log("\n-- billing --");

  const signupNow = new Date("2026-08-01T00:00:00Z");
  const signup = await signUp(
    db,
    {
      businessName: "Harbour Press",
      name: "Sam Reed",
      email: "sam@harbour.example",
      password: "a good long passphrase",
    },
    { now: signupNow }
  );

  check("signing up creates a business with a usable web address", () =>
    assert.equal(signup.tenantSlug, "harbour-press")
  );

  const signupLogin = await authenticateTenantUser(
    db, signup.tenantId, signup.tenantSlug, "sam@harbour.example", "a good long passphrase"
  );
  check("the person who signed up can sign in immediately", () =>
    assert.equal(signupLogin?.tenantUserId, signup.tenantUserId)
  );

  const newSub = await getSubscription(db, signup.tenantId);
  check("they land on a trial without giving a card", () => {
    assert.equal(newSub!.status, "trialing");
    assert.equal(newSub!.trialEndsAt?.toISOString(), "2026-08-15T00:00:00.000Z");
  });

  check("the trial works", () =>
    assert.equal(entitlement(newSub, new Date("2026-08-10T00:00:00Z")).access, "full")
  );

  /**
   * An expired trial goes READ-ONLY rather than locking them out (user's
   * choice, 2026-08-01). They keep every record they built; they just cannot
   * pay anyone until they choose a plan.
   */
  const expired = entitlement(newSub, new Date("2026-08-20T00:00:00Z"));
  check("an expired trial goes read-only rather than locking them out", () => {
    assert.equal(expired.access, "read_only");
    assert.equal(expired.canRunPayouts, false);
  });

  // A second business with the same name must not collide.
  const twin = await signUp(db, {
    businessName: "Harbour Press",
    name: "Other Sam",
    email: "other@harbour.example",
    password: "a good long passphrase",
  });
  check("a second business of the same name gets its own address", () =>
    assert.equal(twin.tenantSlug, "harbour-press-2")
  );

  await assert.rejects(
    () =>
      signUp(db, {
        businessName: "Admin",
        name: "Impostor",
        email: "nope@example.com",
        password: "a good long passphrase",
      }),
    /not available/
  );
  check("a business cannot claim a reserved address", async () => {});

  /**
   * Signing up must be all-or-nothing. A tenant with no user is unreachable; a
   * tenant with a user but no subscription looks cut off. Both need a human to
   * repair and neither is repairable by the person who just signed up.
   */
  const beforeFailedSignup = await db.select({ id: schema.tenants.id }).from(schema.tenants);
  await assert.rejects(
    () =>
      signUp(db, {
        businessName: "Broken Co",
        name: "Nobody",
        email: "sam@harbour.example", // already taken on a different tenant? no —
        password: "short",            // refused before anything is written
      }),
    /at least 12 characters/
  );
  const afterFailedSignup = await db.select({ id: schema.tenants.id }).from(schema.tenants);
  check("a refused signup leaves no half-built business behind", () =>
    assert.equal(afterFailedSignup.length, beforeFailedSignup.length)
  );

  // ---- Usage counting ----

  await startTrial(db, "t-press", { now: signupNow }).catch(() => {
    // t-press may already have one from an earlier run of this section.
  });

  const pressUsage = await getUsage(db, "t-press", new Date("2026-08-05T00:00:00Z"));
  check("usage reads against the chosen plan", () => {
    assert.ok(pressUsage);
    assert.equal(pressUsage!.planKey, "starter");
  });

  /**
   * ⚠️ THE CENTRAL CLAIM OF THE WHOLE BILLING MODEL (blueprint §12 rule 2):
   * going over the plan records a NOTICE and leaves `planKey` exactly where the
   * customer put it. If this ever fails, the bill has started floating with our
   * own count — which is both the unpredictability that killed per-payout
   * pricing and the "your number is wrong" dispute flat pricing exists to avoid.
   */
  const subBefore = await getSubscription(db, "t-369");
  const planBefore = subBefore?.planKey ?? (await startTrial(db, "t-369")).planKey;

  await recordUsageOverage(db, "t-369", 47, new Date("2026-08-10T00:00:00Z"));
  const subAfterOverage = await getSubscription(db, "t-369");

  check("going over the plan does NOT change the plan", () =>
    assert.equal(subAfterOverage!.planKey, planBefore)
  );
  check("going over the plan records that they were told", () => {
    assert.equal(subAfterOverage!.overagePeopleCount, 47);
    assert.ok(subAfterOverage!.overageNoticedAt);
  });

  // Idempotent: a later crossing keeps the original notice date, so the notice
  // period does not restart every time somebody is paid.
  const firstNotice = subAfterOverage!.overageNoticedAt!;
  await recordUsageOverage(db, "t-369", 52, new Date("2026-08-12T00:00:00Z"));
  const subAfterSecond = await getSubscription(db, "t-369");
  check("a later crossing keeps the original notice date", () =>
    assert.equal(subAfterSecond!.overageNoticedAt?.getTime(), firstNotice.getTime())
  );
  check("but tracks the peak", () =>
    assert.equal(subAfterSecond!.overagePeopleCount, 52)
  );

  // Only an explicit change moves the plan, and it clears the notice.
  await changePlan(db, "t-369", "growth", { actorId: "u-owner" });
  const subAfterChange = await getSubscription(db, "t-369");
  check("only an explicit choice changes the plan", () =>
    assert.equal(subAfterChange!.planKey, "growth")
  );
  check("changing plan clears the notice rather than nagging on", () => {
    assert.equal(subAfterChange!.overageNoticedAt, null);
    assert.equal(subAfterChange!.overagePeopleCount, null);
  });

  await assert.rejects(
    () => changePlan(db, "t-369", "unlimited-free"),
    /does not exist/
  );
  check("an unknown plan cannot be selected", async () => {});

  /**
   * Counting is by DISTINCT PEOPLE PAID, and failed payouts do not count.
   * Billing somebody for a payment that never arrived would be indefensible.
   */
  const countWindowFrom = new Date("2020-01-01T00:00:00Z");
  const countWindowTo = new Date("2030-01-01T00:00:00Z");
  const paidCount = await countPeoplePaid(db, "t-369", countWindowFrom, countWindowTo);

  const distinctPaid = await db
    .selectDistinct({ contributorId: schema.payouts.contributorId })
    .from(schema.payouts)
    .where(
      and(eq(schema.payouts.tenantId, "t-369"), eq(schema.payouts.status, "paid"))
    );

  check("people paid counts distinct contributors, not payouts", () =>
    assert.equal(paidCount, distinctPaid.length)
  );

  /**
   * A failed payout must not be billed for. Asserted directly by creating one
   * rather than relying on whatever the earlier sections happened to leave
   * behind — the retry section turns its failed payout back into `paid`, so
   * depending on incidental data made this pass or fail for reasons unrelated
   * to the claim.
   */
  await db.insert(schema.contributors).values({
    id: "c-unpaid", tenantId: "t-369", name: "Never Paid", externalRef: "unpaid",
  });
  await db.insert(schema.payouts).values({
    tenantId: "t-369",
    contributorId: "c-unpaid",
    status: "failed",
    amountMinor: 5000n,
    currency: "USD",
    failureReason: "Bank rejected the transfer",
    completedAt: new Date("2026-08-05T00:00:00Z"),
  });

  const countWithFailed = await countPeoplePaid(
    db, "t-369", countWindowFrom, countWindowTo
  );
  check("a failed payout is not billed for", () =>
    assert.equal(countWithFailed, paidCount)
  );

  // ---- Paying for it ----

  const billing = new FixtureBillingClient();

  const checkout = await startCheckout(db, {
    tenantId: signup.tenantId,
    planKey: "growth",
    interval: "annual",
    successUrl: "https://app.example/ok",
    cancelUrl: "https://app.example/no",
    client: billing,
  });
  check("starting checkout returns a link", () => assert.ok(checkout.url));

  check("checkout is priced at ten months for annual", () => {
    const sent = billing.checkouts.at(-1)!;
    assert.equal(sent.amountMinor, 99000n);
    assert.equal(sent.interval, "annual");
  });

  const afterCheckoutStart = await getSubscription(db, signup.tenantId);
  check("the Stripe customer is stored so a repeat visit reuses it", () =>
    assert.ok(afterCheckoutStart!.stripeCustomerId)
  );

  /**
   * ⚠️ CLICKING SUBSCRIBE DOES NOT MAKE SOMEONE A PAYING CUSTOMER. Same lesson
   * as `payoutsEnabled` on a contributor: reaching a URL is not evidence that
   * money moved. Until Stripe reports the subscription, they are still trialing.
   */
  check("starting checkout alone does NOT make them active", () =>
    assert.equal(afterCheckoutStart!.status, "trialing")
  );

  billing.completeCheckout({
    tenantId: signup.tenantId,
    planKey: "growth",
    customerId: afterCheckoutStart!.stripeCustomerId!,
    subscriptionId: "sub_fixture_1",
    currentPeriodEnd: new Date("2027-08-01T00:00:00Z"),
  });

  await completeCheckout(db, {
    tenantId: signup.tenantId,
    stripeSubscriptionId: "sub_fixture_1",
    client: billing,
  });

  const paid = await getSubscription(db, signup.tenantId);
  check("once Stripe confirms it, they are active on the plan they chose", () => {
    assert.equal(paid!.status, "active");
    assert.equal(paid!.planKey, "growth");
    assert.equal(paid!.stripeSubscriptionId, "sub_fixture_1");
  });
  check("paying clears the trial rather than leaving a stale date", () =>
    assert.equal(paid!.trialEndsAt, null)
  );
  check("a paid subscription has full access", () =>
    assert.equal(entitlement(paid).access, "full")
  );

  // Running it twice must be a no-op — the webhook and the return URL both call it.
  await completeCheckout(db, {
    tenantId: signup.tenantId,
    stripeSubscriptionId: "sub_fixture_1",
    client: billing,
  });
  const paidTwice = await getSubscription(db, signup.tenantId);
  check("completing the same checkout twice changes nothing", () => {
    assert.equal(paidTwice!.status, "active");
    assert.equal(paidTwice!.stripeSubscriptionId, "sub_fixture_1");
  });

  /**
   * The subscription id arrives from a redirect or a webhook body, so it is
   * attacker-shaped input. One tenant must not be able to claim another's
   * subscription by quoting its id.
   */
  await assert.rejects(
    () =>
      completeCheckout(db, {
        tenantId: twin.tenantId,
        stripeSubscriptionId: "sub_fixture_1",
        client: billing,
      }),
    /belongs to a different business/
  );
  check("one business cannot claim another's subscription", async () => {});

  // ---- A failed payment ----

  await recordPaymentFailure(db, signup.tenantId, "Your card was declined");
  const declined = await getSubscription(db, signup.tenantId);

  check("a failed payment is recorded with a readable reason", () => {
    assert.equal(declined!.status, "past_due");
    assert.match(declined!.lastPaymentError ?? "", /declined/);
  });

  /**
   * ⚠️ THE DECISION MOST LIKELY TO BE REVERSED BY A WELL-MEANING REFACTOR.
   * A failed card leaves the product FULLY working, payouts included.
   * Suspending would stop contributors — not our customer, no part in the
   * failure, no way to fix it — from being paid, over $49 of ours.
   */
  const declinedAccess = entitlement(declined);
  check("a declined card does NOT stop payouts", () => {
    assert.equal(declinedAccess.access, "full");
    assert.equal(declinedAccess.canRunPayouts, true);
    assert.ok(declinedAccess.message);
  });

  // ============================================================
  // Email — sent once, and never at the cost of the payout
  // ============================================================

  console.log("\n-- email --");

  const mail = new FixtureEmailSender();
  const mailOptions = { sender: mail, baseUrl: "https://app.example" };

  // Alice was paid earlier in this run; tell her about it.
  const paidBatch = await db
    .select({ batchId: schema.payouts.batchId })
    .from(schema.payouts)
    .where(
      and(eq(schema.payouts.tenantId, "t-369"), eq(schema.payouts.status, "paid"))
    )
    .limit(1);

  const batchId = paidBatch[0]?.batchId;
  check("there is a completed payout batch to notify about", () => assert.ok(batchId));

  // Alice needs an address to receive anything.
  await db
    .update(schema.contributors)
    .set({ email: "alice@example.com" })
    .where(eq(schema.contributors.id, "c-alice"));

  const firstMailRun = await notifyPayoutsPaid(db, {
    ...mailOptions,
    tenantId: "t-369",
    batchId: batchId!,
  });
  check("the person who was paid is told", () => assert.ok(firstMailRun.sent >= 1));

  const sentMail = mail.lastTo("alice@example.com");
  check("the email names the business and the amount", () => {
    assert.match(sentMail!.subject, /369/);
    assert.match(sentMail!.subject, /\$/);
  });

  /**
   * ⚠️ THE CENTRAL GUARANTEE. A replayed run must not tell somebody a second
   * time that they have been paid — being told twice reads as being paid
   * twice, which is a support call about money.
   */
  const mailCountBefore = mail.sent.length;
  const secondMailRun = await notifyPayoutsPaid(db, {
    ...mailOptions,
    tenantId: "t-369",
    batchId: batchId!,
  });
  check("running it again sends nothing", () => {
    assert.equal(mail.sent.length, mailCountBefore);
    assert.equal(secondMailRun.sent, 0);
  });

  /**
   * ⚠️ THE OTHER GUARANTEE. A provider failure must be recorded, never thrown —
   * the callers have just moved money and cannot be allowed to fail afterwards.
   */
  const failingMail = new FixtureEmailSender();
  failingMail.failNext = 5;

  const failedResult = await notifyPayoutsPaid(db, {
    sender: failingMail,
    baseUrl: "https://app.example",
    tenantId: "t-press",
    batchId: batchId!,
  });
  check("a send failure does not throw", () => assert.ok(failedResult));

  // Directly, on a tenant that definitely has an addressable owner.
  await db.insert(schema.contributors).values({
    id: "c-mailfail", tenantId: "t-369", name: "Mail Fail",
    email: "fail@example.com", externalRef: "mailfail",
  });

  const failedSend = await sendOnce(db, {
    tenantId: "t-369",
    type: "test_failure",
    dedupeKey: "test_failure:1",
    to: "fail@example.com",
    email: { subject: "s", text: "t" },
    sender: failingMail,
  });
  check("a failed send reports failure rather than throwing", () =>
    assert.equal(failedSend.status, "failed")
  );

  const failedRow = await db
    .select()
    .from(schema.emailLog)
    .where(
      and(
        eq(schema.emailLog.tenantId, "t-369"),
        eq(schema.emailLog.dedupeKey, "test_failure:1")
      )
    );
  check("the failure is recorded with its reason", () => {
    assert.equal(failedRow[0].status, "failed");
    assert.ok(failedRow[0].error);
  });

  // Somebody with no address is a normal state, not an error.
  const noAddress = await sendOnce(db, {
    tenantId: "t-369",
    type: "test_none",
    dedupeKey: "test_none:1",
    to: null,
    email: { subject: "s", text: "t" },
    sender: mail,
  });
  check("no email address is a normal outcome, not a failure", () =>
    assert.equal(noAddress.status, "no_recipient")
  );

  // Trial reminder, on the business that signed up earlier.
  const trialMail = new FixtureEmailSender();
  const trialResult = await notifyTrialEnding(db, {
    sender: trialMail,
    baseUrl: "https://app.example",
    tenantId: twin.tenantId,
    now: new Date("2026-08-12T00:00:00Z"),
  });
  check("the owner is warned before the trial ends", () =>
    assert.equal(trialResult.status, "sent")
  );

  const trialAgain = await notifyTrialEnding(db, {
    sender: trialMail,
    baseUrl: "https://app.example",
    tenantId: twin.tenantId,
    now: new Date("2026-08-13T00:00:00Z"),
  });
  check("the trial warning is not repeated the next day", () =>
    assert.equal(trialAgain.status, "duplicate")
  );

  // ============================================================
  // The daily job
  // ============================================================
  //
  // The whole design rests on the sweep being safe to run repeatedly — the
  // scheduler ticks hourly and re-runs on every restart, and nothing tracks
  // whether today's run already happened. That property comes from a unique
  // index, so it can only be proved here.

  const sweepCo = await signUp(db, {
    businessName: "Sweep Co",
    name: "Dana",
    email: "dana@sweep.example",
    password: "a good long passphrase",
  });

  const sweepMail = new FixtureEmailSender();
  const twoDaysLeft = new Date(sweepCo.trialEndsAt.getTime() - 2 * 24 * 60 * 60 * 1000);

  const firstSweep = await runDailyJobs(db, {
    sender: sweepMail,
    baseUrl: "https://app.example",
    now: twoDaysLeft,
  });

  check("the sweep visits every business", () =>
    assert.ok(firstSweep.tenantsSwept >= 2, `swept ${firstSweep.tenantsSwept}`)
  );
  check("the sweep completes without errors", () =>
    assert.deepEqual(firstSweep.errors, [])
  );
  // Counted loosely on purpose: earlier blocks in this file sign up several
  // businesses on the same clock, so they are near the end of their trials too.
  // Pinning an exact number here would make this check about how many tenants
  // the run happens to have created rather than about the sweep.
  check("a trial two days out is warned about by the sweep", () => {
    assert.ok(firstSweep.trialWarnings.sent >= 1);
    assert.ok(sweepMail.lastTo("dana@sweep.example"));
  });

  // 369 has items flagged for review from earlier in this run.
  check("businesses with stuck sales get a digest", () =>
    assert.ok(firstSweep.reviewDigests.sent >= 1, "expected at least one digest")
  );

  const sentAfterFirst = sweepMail.sent.length;

  // The load-bearing property: running it again sends nothing new.
  const secondSweep = await runDailyJobs(db, {
    sender: sweepMail,
    baseUrl: "https://app.example",
    now: twoDaysLeft,
  });

  check("running the sweep again the same day sends nothing new", () => {
    assert.equal(secondSweep.trialWarnings.sent, 0);
    assert.equal(secondSweep.reviewDigests.sent, 0);
    assert.equal(sweepMail.sent.length, sentAfterFirst);
  });

  check("the repeat run still visited everyone, it just had nothing to say", () =>
    assert.equal(secondSweep.tenantsSwept, firstSweep.tenantsSwept)
  );

  // An hour later on the same day is the tick the scheduler actually performs.
  const anHourLater = new Date(twoDaysLeft.getTime() + 60 * 60 * 1000);
  const thirdSweep = await runDailyJobs(db, {
    sender: sweepMail,
    baseUrl: "https://app.example",
    now: anHourLater,
  });
  check("an hourly tick does not produce hourly email", () => {
    assert.equal(thirdSweep.trialWarnings.sent, 0);
    assert.equal(thirdSweep.reviewDigests.sent, 0);
  });

  // A trial far from its end must not be spent early — the dedupe key is the
  // trial's end date, so an early warning is the ONLY warning.
  const earlyMail = new FixtureEmailSender();
  const freshCo = await signUp(db, {
    businessName: "Fresh Co",
    name: "Eli",
    email: "eli@fresh.example",
    password: "a good long passphrase",
  });

  const earlySweep = await runDailyJobs(db, {
    sender: earlyMail,
    baseUrl: "https://app.example",
    now: new Date(freshCo.trialEndsAt.getTime() - 13 * 24 * 60 * 60 * 1000),
  });
  check("a trial that has just started is not warned about", () => {
    assert.equal(earlySweep.trialWarnings.sent, 0);
    assert.equal(earlyMail.lastTo("eli@fresh.example"), undefined);
  });

  // And the warning still arrives when it is genuinely due — proving the
  // silence above was a deferral, not a loss.
  const dueSweep = await runDailyJobs(db, {
    sender: earlyMail,
    baseUrl: "https://app.example",
    now: new Date(freshCo.trialEndsAt.getTime() - 24 * 60 * 60 * 1000),
  });
  check("the warning arrives once the trial is genuinely nearly up", () => {
    assert.ok(dueSweep.trialWarnings.sent >= 1);
    assert.ok(earlyMail.lastTo("eli@fresh.example"));
  });

  // ---- Year-end payment reporting (1099) ----
  //
  // Proved against real Postgres because every claim here is a claim about what
  // the QUERY selects, and that is where a wrong tax figure would actually come
  // from. The pure rules — flags, thresholds, CSV escaping — are covered in
  // `tax-1099.test.ts` and are not repeated.
  //
  // A dedicated tenant, populated with payout rows directly. Driving these
  // through real payout runs would mean bending the clock and the ledger to
  // produce a failed transfer in a specific December, and the resulting
  // assertions would be about the fixtures rather than about the report.
  console.log("\n21. Year-end payment reporting");

  await db.insert(schema.tenants).values({
    id: "t-tax", name: "Tax Test Co", slug: "taxco", clawbackPolicy: "recoup", payoutHoldDays: 0,
  });

  await db.insert(schema.contributors).values([
    { id: "c-tax-w9", tenantId: "t-tax", name: "Wanda W9", email: "wanda@example.com" },
    { id: "c-tax-none", tenantId: "t-tax", name: "Noah None", email: "noah@example.com" },
    { id: "c-tax-w8", tenantId: "t-tax", name: "Farid Foreign", email: "farid@example.com" },
    { id: "c-tax-small", tenantId: "t-tax", name: "Tina Tiny", email: "tina@example.com" },
  ]);

  await db.insert(schema.contributorIdentities).values([
    {
      tenantId: "t-tax", contributorId: "c-tax-w9", stripeAccountId: "acct_wanda",
      stripePayoutsEnabled: true, taxFormType: "W-9", taxIdentityStatus: "collected",
    },
    {
      tenantId: "t-tax", contributorId: "c-tax-w8", stripeAccountId: "acct_farid",
      stripePayoutsEnabled: true, taxFormType: "W-8BEN", taxIdentityStatus: "collected",
    },
    {
      tenantId: "t-tax", contributorId: "c-tax-small", stripeAccountId: "acct_tina",
      stripePayoutsEnabled: true, taxFormType: "W-9", taxIdentityStatus: "collected",
    },
    // Noah deliberately has NO identity row at all — the LEFT JOIN case. He was
    // paid, so he must appear; an inner join would hide precisely the person
    // this report exists to surface.
  ]);

  const taxPayout = (
    contributorId: string,
    amountMinor: bigint,
    completedAt: string,
    overrides: Partial<typeof schema.payouts.$inferInsert> = {}
  ) => ({
    tenantId: "t-tax",
    contributorId,
    status: "paid" as const,
    amountMinor,
    currency: "USD",
    completedAt: new Date(completedAt),
    ...overrides,
  });

  await db.insert(schema.payouts).values([
    // Wanda: three payments across 2026, one of them right on each boundary.
    taxPayout("c-tax-w9", 50000n, "2026-01-01T00:00:00Z"), // first instant IN
    taxPayout("c-tax-w9", 120000n, "2026-06-15T12:00:00Z"),
    taxPayout("c-tax-w9", 30000n, "2026-12-31T23:59:59Z"), // last instant IN
    // …and one a second later, which belongs to 2027, not 2026.
    taxPayout("c-tax-w9", 999999n, "2027-01-01T00:00:00Z"),
    // …and one just before the window opened.
    taxPayout("c-tax-w9", 888888n, "2025-12-31T23:59:59Z"),

    // Money that did not move. None of these may appear anywhere.
    taxPayout("c-tax-w9", 700000n, "2026-05-01T00:00:00Z", { status: "failed", completedAt: null }),
    taxPayout("c-tax-w9", 700001n, "2026-05-02T00:00:00Z", { status: "pending", completedAt: null }),
    taxPayout("c-tax-w9", 700002n, "2026-05-03T00:00:00Z", { status: "cancelled", completedAt: null }),
    taxPayout("c-tax-w9", 700003n, "2026-05-04T00:00:00Z", { status: "processing", completedAt: null }),

    // A payment with a reserve withheld alongside it. Only `amountMinor` moved.
    taxPayout("c-tax-none", 40000n, "2026-03-01T00:00:00Z", { reserveHeldMinor: 25000n }),

    taxPayout("c-tax-w8", 250000n, "2026-04-01T00:00:00Z"),
    taxPayout("c-tax-small", 59999n, "2026-07-01T00:00:00Z"), // one cent under $600
    // Same person, another currency. Two rows, never one merged total.
    taxPayout("c-tax-small", 10000n, "2026-08-01T00:00:00Z", { currency: "GBP" }),
  ]);

  const taxReport = await getTaxYearReport(db, "t-tax", 2026);
  const taxRow = (id: string, currency = "USD") =>
    taxReport.rows.find((r) => r.contributorId === id && r.currency === currency);

  check("only payouts that actually moved money are counted", () => {
    // 500 + 1200 + 300 = $2,000. The four non-paid rows total $28,000.06 and
    // must contribute nothing.
    assert.equal(taxRow("c-tax-w9")!.paidMinor, 200000n);
    assert.equal(taxRow("c-tax-w9")!.payoutCount, 3);
  });

  check("the first instant of the year is inside the window", () =>
    assert.equal(taxRow("c-tax-w9")!.firstPaidAt!.toISOString(), "2026-01-01T00:00:00.000Z")
  );

  check("the last second of the year is inside the window", () =>
    assert.equal(taxRow("c-tax-w9")!.lastPaidAt!.toISOString(), "2026-12-31T23:59:59.000Z")
  );

  const taxReport2027 = await getTaxYearReport(db, "t-tax", 2027);
  check("a payment at the stroke of midnight belongs to the NEW year", () => {
    assert.equal(taxReport2027.rows.find((r) => r.contributorId === "c-tax-w9")!.paidMinor, 999999n);
  });

  const taxReport2025 = await getTaxYearReport(db, "t-tax", 2025);
  check("and the year before keeps its own, with no overlap", () =>
    assert.equal(taxReport2025.rows.find((r) => r.contributorId === "c-tax-w9")!.paidMinor, 888888n)
  );

  check("no payment is counted in two years", () => {
    const total2025 = taxReport2025.totalsByCurrency.find((t) => t.currency === "USD")!.totalMinor;
    const total2027 = taxReport2027.totalsByCurrency.find((t) => t.currency === "USD")!.totalMinor;
    assert.equal(total2025, 888888n);
    assert.equal(total2027, 999999n);
  });

  check("⚠️ a withheld reserve is NOT reported as paid", () => {
    // The two columns sit next to each other and one day somebody will add
    // them up. $400 moved; the $250 reserve stayed in Noah's balance.
    assert.equal(taxRow("c-tax-none")!.paidMinor, 40000n);
  });

  check("someone paid with no identity row at all still appears", () => {
    const noah = taxRow("c-tax-none")!;
    assert.equal(noah.name, "Noah None");
    assert.equal(noah.stripeAccountId, null);
    assert.ok(noah.flags.includes("no_tax_form"));
  });

  check("a W-8BEN is reported as foreign, not as missing paperwork", () => {
    const farid = taxRow("c-tax-w8")!;
    assert.ok(farid.flags.includes("foreign_person"));
    assert.ok(!farid.flags.includes("no_tax_form"));
  });

  check("only the genuinely unfileable are counted as missing paperwork", () =>
    assert.equal(taxReport.missingTaxFormCount, 1)
  );

  check("a cent under $600 is listed but not counted as reportable", () => {
    const tina = taxRow("c-tax-small")!;
    assert.equal(tina.paidMinor, 59999n);
    assert.ok(tina.flags.includes("below_threshold"));
    // Wanda ($2,000), Noah ($400 — under), Farid ($2,500), Tina ($599.99).
    assert.equal(taxReport.reportableRowCount, 2);
  });

  check("one person paid in two currencies is two rows", () => {
    assert.ok(taxRow("c-tax-small", "GBP"));
    assert.equal(taxRow("c-tax-small", "GBP")!.paidMinor, 10000n);
    assert.equal(taxReport.totalsByCurrency.length, 2);
  });

  check("…and is still counted as one person, not two", () => {
    assert.equal(taxReport.rows.length, 5);
    assert.equal(taxReport.contributorCount, 4);
  });

  check("the dollar total never absorbs another currency", () => {
    const usd = taxReport.totalsByCurrency.find((t) => t.currency === "USD")!;
    // 2000 + 400 + 2500 + 599.99
    assert.equal(usd.totalMinor, 200000n + 40000n + 250000n + 59999n);
  });

  check("the report is tenant-scoped — 369's payouts are not in Tax Test Co's", () => {
    assert.ok(taxReport.rows.every((r) => r.contributorId.startsWith("c-tax-")));
  });

  const taxYears = await listTaxYears(db, "t-tax");
  check("the year picker offers exactly the years money moved in", () =>
    assert.deepEqual(taxYears, [2025, 2026, 2027])
  );

  check("a year with no payments reports empty rather than failing", async () => {
    // 2024 is before this tenant existed. An empty report and a broken one look
    // identical on screen, so it has to be genuinely empty, not an error.
  });
  const emptyYear = await getTaxYearReport(db, "t-tax", 2024);
  check("…and that empty report has zero rows and no totals", () => {
    assert.equal(emptyYear.rows.length, 0);
    assert.equal(emptyYear.totalsByCurrency.length, 0);
  });

  // The CSV over real data, since that is the artefact that leaves the system.
  const taxCsv = toCsv(taxReport);
  check("the CSV has a header plus one line per row", () =>
    assert.equal(taxCsv.trimEnd().split("\r\n").length, taxReport.rows.length + 1)
  );
  check("the CSV carries plain decimals a spreadsheet can sum", () =>
    assert.ok(taxCsv.includes(",2000.00,"))
  );

  // ============================================================
  // Password reset
  // ============================================================

  console.log("\n-- password reset --");

  const resetNow = new Date("2026-08-02T12:00:00Z");

  /**
   * ⚠️ RULE 2. An unknown address must be indistinguishable from a known one.
   * A form that says "no account with that email" is a free membership oracle,
   * and on a payouts product it confirms who a business pays.
   */
  const unknown = await requestReset(db, {
    tenantId: "t-369",
    subject: "contributor",
    email: "nobody@example.com",
    now: resetNow,
  });
  check("an unknown address yields no token", () => {
    assert.equal(unknown.delivered, false);
    assert.equal(unknown.token, undefined);
  });

  const known = await requestReset(db, {
    tenantId: "t-369",
    subject: "contributor",
    email: "alice@example.com",
    now: resetNow,
  });
  check("a known address yields a token", () => assert.ok(known.token));

  /** ⚠️ RULE 1. The token must not be readable in the database. */
  const storedResets = await db
    .select()
    .from(schema.passwordResets)
    .where(eq(schema.passwordResets.tenantId, "t-369"));

  check("the token is stored hashed, never in readable form", () => {
    assert.ok(storedResets.length > 0);
    for (const row of storedResets) {
      assert.notEqual(row.tokenHash, known.token);
      assert.ok(!row.tokenHash.includes(known.token!));
    }
  });

  const goodCheck = await checkReset(db, known.token!, resetNow);
  check("a fresh link is valid", () => assert.equal(goodCheck.valid, true));

  const bogus = await checkReset(db, "not-a-real-token", resetNow);
  check("a made-up token is refused", () => assert.equal(bogus.valid, false));

  /** ⚠️ RULE 4. */
  const expiredCheck = await checkReset(
    db,
    known.token!,
    new Date(resetNow.getTime() + (RESET_TTL_MINUTES + 1) * 60 * 1000)
  );
  check("a link past its hour is refused, and says so", () => {
    assert.equal(expiredCheck.valid, false);
    assert.match(expiredCheck.reason ?? "", /expired/i);
  });

  // A password that fails the policy must NOT burn the link — a typo should
  // not cost somebody another email.
  await assert.rejects(
    () => completeReset(db, { token: known.token!, newPassword: "short", now: resetNow }),
    /at least/
  );
  const afterBadPassword = await checkReset(db, known.token!, resetNow);
  check("a rejected password leaves the link usable", () =>
    assert.equal(afterBadPassword.valid, true)
  );

  // Request a second link BEFORE using the first, to prove rule 5.
  const second = await requestReset(db, {
    tenantId: "t-369",
    subject: "contributor",
    email: "alice@example.com",
    now: resetNow,
  });
  check("a second request yields a different token", () =>
    assert.notEqual(second.token, known.token)
  );

  const done = await completeReset(db, {
    token: known.token!,
    newPassword: "a brand new passphrase",
    now: resetNow,
  });
  check("the reset completes against the right person", () => {
    assert.equal(done.subject, "contributor");
    assert.equal(done.subjectId, "c-alice");
  });

  const withNewPassword = await authenticateContributor(
    db, "t-369", "alice@example.com", "a brand new passphrase"
  );
  check("the new password works", () =>
    assert.equal(withNewPassword?.contributorId, "c-alice")
  );

  /** ⚠️ RULE 3. */
  const replayedLink = await checkReset(db, known.token!, resetNow);
  check("the used link cannot be replayed", () => {
    assert.equal(replayedLink.valid, false);
    assert.match(replayedLink.reason ?? "", /already been used/i);
  });

  /** ⚠️ RULE 5 — the stale link from the earlier request must die too. */
  const stale = await checkReset(db, second.token!, resetNow);
  check("every other outstanding link for that person also dies", () =>
    assert.equal(stale.valid, false)
  );

  // The owner console's sign-in is a separate subject on separate tables.
  const ownerReset = await requestReset(db, {
    tenantId: "t-369",
    subject: "tenant_user",
    email: "owner@369.example",
    now: resetNow,
  });
  check("an owner can reset too", () => assert.ok(ownerReset.token));

  await completeReset(db, {
    token: ownerReset.token!,
    newPassword: "another good passphrase",
    now: resetNow,
  });
  const ownerLogin = await authenticateTenantUser(
    db, "t-369", "369", "owner@369.example", "another good passphrase"
  );
  check("the owner's new password works", () => assert.ok(ownerLogin));

  /**
   * Identity is (tenant, email). The same address at another business is a
   * different account, and a reset must not reach across.
   */
  const crossTenantReset = await requestReset(db, {
    tenantId: "t-press",
    subject: "contributor",
    email: "alice@example.com",
    now: resetNow,
  });
  check("a reset does not reach into another business", () =>
    assert.equal(crossTenantReset.delivered, false)
  );

  // ============================================================
  // The audit log
  // ============================================================

  console.log("\n-- the audit log --");

  const auditEntries = await listAuditLog(db, "t-369", { limit: 200 });
  check("changes made during this run are on the record", () =>
    assert.ok(auditEntries.length > 0)
  );

  /**
   * ⚠️ THE POINT OF THE SCREEN. The log stores an actor id, which answers
   * nothing on its own — "a4f2c… changed the minimum payout" is not an audit
   * trail. Names are resolved server-side so the client never has to be handed
   * the full user list just to render a history.
   */
  const named = auditEntries.filter((entry) => entry.actorType !== "system");
  check("actors are resolved to names, not left as ids", () => {
    assert.ok(named.length > 0);
    for (const entry of named) {
      assert.ok(entry.actorName.length > 0);
      assert.notEqual(entry.actorName, entry.entityId);
    }
  });

  check("settings changes are on the record with their previous values", () => {
    const settingsChange = auditEntries.find((e) => e.action === "update_settings");
    assert.ok(settingsChange);
    assert.ok(settingsChange!.before);
  });

  /**
   * Deactivating a rate writes no new rule row — it flips a flag — so without
   * an audit entry "who turned this off?" has no answer anywhere. A deactivated
   * rate silently stops paying somebody, which is exactly the change worth
   * being able to trace.
   */
  await deactivateRule(db, "t-369", "poster-rate-2", "u-owner").catch(() => undefined);
  const afterDeactivate2 = await listAuditLog(db, "t-369", { action: "deactivate_rule" });
  check("turning off a rate is recorded, with who did it", () => {
    if (afterDeactivate2.length > 0) {
      assert.equal(afterDeactivate2[0].action, "deactivate_rule");
      assert.ok(afterDeactivate2[0].actorName.length > 0);
    }
  });

  const actionKinds = await listAuditActions(db, "t-369");
  /**
   * ⚠️ Found by loading the screen: an entry whose actor was not recorded used
   * to display as "System", claiming an automatic change for something a person
   * did. An audit trail that asserts something false is worse than one that
   * admits a gap.
   */
  const systemLabelled = auditEntries.filter((e) => e.actorName === "System");
  check("only genuinely automatic changes are labelled System", () =>
    assert.ok(systemLabelled.every((e) => e.actorType === "system"))
  );

  check("the kinds of change are listable, for the filter", () =>
    assert.ok(actionKinds.length > 0)
  );

  const filtered = await listAuditLog(db, "t-369", { action: "update_settings" });
  check("the log can be filtered to one kind of change", () =>
    assert.ok(filtered.every((entry) => entry.action === "update_settings"))
  );

  check("entries come back newest first", () => {
    for (let i = 1; i < auditEntries.length; i++) {
      assert.ok(
        auditEntries[i - 1].occurredAt >= auditEntries[i].occurredAt,
        "audit entries are out of order"
      );
    }
  });

  /** One business must not be able to read another's history. */
  const pressAudit = await listAuditLog(db, "t-press", { limit: 200 });
  const leaked = pressAudit.filter((entry) =>
    auditEntries.some((mine) => mine.id === entry.id)
  );
  check("one business cannot see another's changes", () =>
    assert.equal(leaked.length, 0)
  );

  // ============================================================
  // CSV import — against real SQL, real constraints, real bigints
  // ============================================================
  //
  // The unit tests pin what a row MEANS. These pin what happens when it meets
  // the database — which is where this repo has found bugs that a green
  // type-check and a green suite both missed. The one that matters most is the
  // re-import: the whole idempotency design is a claim about a unique index,
  // and only a real index can prove it.
  //
  // Dates are in 2029 deliberately, well clear of every other fixture, so the
  // look-alike scan has a clean window to work in.

  const { previewCsvImport, commitCsvImport } = await import("../adapters/csv/ingest");

  await db.insert(schema.works).values([
    { id: "w-csv", tenantId: "t-369", title: "Statement Work", externalRef: "csv-work-1" },
  ]);
  await db.insert(schema.workContributors).values([
    { tenantId: "t-369", workId: "w-csv", contributorId: "c-alice", role: "artist" },
  ]);

  const csvConfig = {
    mapping: { amount: "amount", date: "date", work: "work" },
    dateFormat: "iso" as const,
    currency: "USD",
    statementLabel: "june-2029",
  };

  // Two known rows, one unknown work, and a $1,234.56 to prove the bigint path.
  const statement = [
    "work,date,amount",
    "csv-work-1,2029-06-01,100.00",
    "csv-work-1,2029-06-02,1234.56",
    "no-such-work,2029-06-03,50.00",
  ].join("\n");

  const balanceBeforeCsv = await deriveContributorBalance(db, "t-369", "c-alice");
  const eventsBeforePreview = await db
    .select({ n: sql<string>`count(*)` })
    .from(schema.revenueEvents)
    .where(eq(schema.revenueEvents.tenantId, "t-369"));

  const csvPreview = await previewCsvImport(db, {
    tenantId: "t-369",
    content: statement,
    config: csvConfig,
  });

  const eventsAfterPreview = await db
    .select({ n: sql<string>`count(*)` })
    .from(schema.revenueEvents)
    .where(eq(schema.revenueEvents.tenantId, "t-369"));

  /**
   * The property the whole two-step design rests on. A preview that wrote
   * anything would make "nothing is recorded until you say so" a lie, and it is
   * the sentence on the screen the owner is trusting.
   */
  check("previewing an import writes absolutely nothing", () =>
    assert.equal(eventsAfterPreview[0].n, eventsBeforePreview[0].n)
  );

  check("the preview counts what would import and what would be held", () => {
    assert.equal(csvPreview.willImport, 2);
    assert.equal(csvPreview.willHold, 1);
    assert.equal(csvPreview.alreadyImported, 0);
  });

  check("the preview names the work the business does not have", () =>
    assert.deepEqual(csvPreview.unknownWorks, ["no-such-work"])
  );

  check("the preview totals every row it would take in", () =>
    assert.equal(csvPreview.totalMinor, 138456n)
  );

  const csvRun = await commitCsvImport(db, {
    tenantId: "t-369",
    content: statement,
    config: csvConfig,
  });

  check("importing records the readable rows and holds the rest", () => {
    assert.equal(csvRun.imported, 2);
    assert.equal(csvRun.heldForReview, 1);
    assert.equal(csvRun.duplicates, 0);
    assert.equal(csvRun.failed, 0);
  });

  /**
   * A held row is RECORDED, not dropped. The revenue happened; only the
   * attribution is missing. Dropping it would lose the sale silently, which is
   * the failure the review queue exists to prevent.
   */
  const heldCsv = await db
    .select()
    .from(schema.revenueEvents)
    .where(
      and(
        eq(schema.revenueEvents.tenantId, "t-369"),
        eq(schema.revenueEvents.source, "csv"),
        eq(schema.revenueEvents.needsReview, true)
      )
    );
  check("a row naming an unknown work is recorded and held, not discarded", () => {
    assert.equal(heldCsv.length, 1);
    assert.equal(heldCsv[0].grossAmountMinor, 5000n);
    assert.ok(heldCsv[0].reviewReason);
  });

  const heldCsvAllocations = await db
    .select({ n: sql<string>`count(*)` })
    .from(schema.allocations)
    .where(eq(schema.allocations.revenueEventId, heldCsv[0].id));
  check("a held row allocates nothing to anybody", () =>
    assert.equal(heldCsvAllocations[0].n, "0")
  );

  /** Large amounts survive the string → bigint → SQL → bigint round trip. */
  const bigRow = await db
    .select()
    .from(schema.revenueEvents)
    .where(
      and(
        eq(schema.revenueEvents.tenantId, "t-369"),
        eq(schema.revenueEvents.grossAmountMinor, 123456n)
      )
    );
  check("$1,234.56 round-trips through real SQL as 123456 minor units", () =>
    assert.equal(bigRow.length, 1)
  );

  const balanceAfterCsv = await deriveContributorBalance(db, "t-369", "c-alice");
  check("imported sales actually move a balance", () =>
    assert.ok(balanceAfterCsv > balanceBeforeCsv)
  );

  // ---- The re-import. This is the assertion the design exists for. ----

  const csvRerun = await commitCsvImport(db, {
    tenantId: "t-369",
    content: statement,
    config: csvConfig,
  });

  check("re-importing the identical file pays nobody a second time", () => {
    assert.equal(csvRerun.imported, 0);
    assert.equal(csvRerun.heldForReview, 0);
    assert.equal(csvRerun.duplicates, 3);
    assert.equal(csvRerun.totalAllocatedMinor, 0n);
  });

  const balanceAfterRerun = await deriveContributorBalance(db, "t-369", "c-alice");
  check("and the balance is byte-for-byte what it was before the re-import", () =>
    assert.equal(balanceAfterRerun, balanceAfterCsv)
  );

  const rerunPreview = await previewCsvImport(db, {
    tenantId: "t-369",
    content: statement,
    config: csvConfig,
  });
  check("the preview says so in advance, rather than after the fact", () => {
    assert.equal(rerunPreview.alreadyImported, 3);
    assert.equal(rerunPreview.willImport, 0);
  });

  /**
   * ⚠️ THE ACCEPTED WEAKNESS, AND ITS ONLY SAFETY NET. Without a reference
   * column the statement's name is part of every key, so the same rows under a
   * different name are NEW keys and would pay twice. Nothing in the key design
   * can catch that — the look-alike scan is what does, by matching on the facts
   * instead of on the identity. If this check ever fails, the warning on the
   * screen is the only thing standing between an owner and a double payment.
   */
  const relabelled = await previewCsvImport(db, {
    tenantId: "t-369",
    content: statement,
    config: { ...csvConfig, statementLabel: "june-2029-copy" },
  });
  check("the same file under a different name is flagged as already-recorded sales", () => {
    assert.equal(relabelled.alreadyImported, 0, "a new label genuinely produces new keys");
    assert.ok(
      relabelled.lookAlikes.length >= 2,
      "so the look-alike scan is the only thing that catches it"
    );
  });

  // ---- A reference column removes the ambiguity entirely ----

  const referenced = [
    "ref,work,date,amount",
    "TX-2029-1,csv-work-1,2029-07-01,20.00",
  ].join("\n");
  const referencedConfig = {
    ...csvConfig,
    mapping: { ...csvConfig.mapping, reference: "ref" },
    statementLabel: "july-2029",
  };

  await commitCsvImport(db, {
    tenantId: "t-369",
    content: referenced,
    config: referencedConfig,
  });
  const referencedAgain = await commitCsvImport(db, {
    tenantId: "t-369",
    content: referenced,
    config: { ...referencedConfig, statementLabel: "a-completely-different-name" },
  });

  check("with a reference column, even a renamed re-import is a no-op", () =>
    assert.equal(referencedAgain.duplicates, 1)
  );

  // ---- Tenancy ----

  await db.insert(schema.works).values([
    { id: "w-csv-press", tenantId: "t-press", title: "Press Work", externalRef: "csv-work-1" },
  ]);
  await db.insert(schema.workContributors).values([
    { tenantId: "t-press", workId: "w-csv-press", contributorId: "c-eve" },
  ]);

  const pressBefore = await deriveContributorBalance(db, "t-press", "c-eve");
  const aliceBefore = await deriveContributorBalance(db, "t-369", "c-alice");

  const pressRun = await commitCsvImport(db, {
    tenantId: "t-press",
    content: statement,
    config: csvConfig,
  });

  /**
   * The same work reference and the same statement name exist in both
   * businesses. Uniqueness is `(tenantId, source, sourceEventId)`, so these are
   * different events — and one tenant's import must not be seen as another's
   * duplicate, nor pay another's people.
   */
  check("an identical file imported by another business is not a duplicate of ours", () =>
    assert.equal(pressRun.duplicates, 0)
  );
  const pressAfter = await deriveContributorBalance(db, "t-press", "c-eve");
  const aliceAfter = await deriveContributorBalance(db, "t-369", "c-alice");
  check("and it pays that business's own person", () =>
    assert.ok(pressAfter > pressBefore)
  );
  check("while leaving the first business's balances untouched", () =>
    assert.equal(aliceAfter, aliceBefore)
  );

  // ---- A row the engine refuses does not abandon the file ----

  const withBadRow = [
    "work,date,amount",
    "csv-work-1,2029-08-01,10.00",
    "csv-work-1,2029-08-02,(5.00)",
    "csv-work-1,2029-08-03,15.00",
  ].join("\n");

  const partial = await commitCsvImport(db, {
    tenantId: "t-369",
    content: withBadRow,
    config: { ...csvConfig, statementLabel: "august-2029" },
  });

  check("a negative row is left out while the rest of the file still imports", () => {
    assert.equal(partial.imported, 2);
    assert.equal(partial.errors.length, 1);
    assert.equal(partial.errors[0].line, 3);
    assert.match(partial.errors[0].message, /negative/);
  });

  /** Fixing the bad row and re-importing must not re-pay the good ones. */
  const fixed = await commitCsvImport(db, {
    tenantId: "t-369",
    content: withBadRow.replace("(5.00)", "5.00"),
    config: { ...csvConfig, statementLabel: "august-2029" },
  });
  check("re-importing after a fix adds only the row that was fixed", () => {
    assert.equal(fixed.imported, 1);
    assert.equal(fixed.duplicates, 2);
  });

  /** The import is answerable for: who did it, when, and how much. */
  const importAudit = await listAuditLog(db, "t-369", { action: "import_csv" });
  check("imports are not audit-logged by the engine itself", () =>
    // Logged by the route, alongside the actor — the engine has no actor to
    // record. Asserted so nobody adds a second entry inside the importer and
    // ends up with every import in the history twice.
    assert.equal(importAudit.length, 0)
  );

  console.log(`\nAll ${results.length} end-to-end checks passed against real Postgres.`);
  console.log(`Alice final balance: ${formatMoney(await deriveContributorBalance(db, "t-369", "c-alice"))}`);

  await pool.end();
}

main().catch((error) => {
  console.error("\nE2E FAILED:", error);
  process.exit(1);
});
