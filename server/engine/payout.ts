/**
 * Payout execution (§5 #12, #13).
 *
 * The second of the two seams §4 identifies — the place where verticals and
 * providers differ. Transfer execution sits behind `TransferExecutor` for the
 * same reason cost resolution sits behind `CostResolver`: cloud sandboxes cannot
 * reach Stripe, and money logic that can only be exercised with live credentials
 * is money logic that never gets exercised.
 *
 * THE STATE MACHINE IS EXPLICIT, NOT A BOOLEAN:
 *
 *     pending ──▶ processing ──▶ paid
 *                     │
 *                     ├──▶ failed ──▶ retrying ──▶ processing
 *                     └──▶ cancelled
 *
 * Every one of those states happens in production. Accounts freeze mid-batch,
 * transfers fail and are retried, and batches routinely finish with some payouts
 * paid and some not — which is why a batch has its own terminal state for
 * `completed_with_failures` rather than pretending it either worked or didn't.
 *
 * THE ORDERING RULE THAT MATTERS MOST. The transfer is attempted *after* the
 * payout row exists and *before* the ledger is debited, and the provider's
 * transfer id is persisted the instant it comes back. If the process dies at any
 * point, the worst case is a payout stuck in `processing` with a recorded
 * transfer id — recoverable by reconciliation. The alternative ordering loses
 * the id and pays twice on retry.
 */

import { and, eq, inArray, lte, or, sql } from "drizzle-orm";

import * as schema from "@shared/engine-schema";
import { loadOpenAdvances, planRecoupment, type RecoupmentPlan } from "./advance";
import type { EngineDb } from "./ingest";
import { formatMoney } from "./money";
import { reserveForPayout, type ClawbackPolicy } from "./reversal";

export type PayoutStatus =
  | "pending"
  | "processing"
  | "paid"
  | "failed"
  | "retrying"
  | "cancelled";

export type PayoutBatchStatus =
  | "open"
  | "processing"
  | "completed"
  | "completed_with_failures"
  | "cancelled";

/** Legal transitions. Anything absent is a bug, not an edge case. */
const ALLOWED_TRANSITIONS: Record<PayoutStatus, PayoutStatus[]> = {
  pending: ["processing", "cancelled"],
  processing: ["paid", "failed"],
  paid: [], // terminal — a paid payout is never re-opened; corrections are adjustments
  failed: ["retrying", "cancelled"],
  retrying: ["processing", "cancelled"],
  cancelled: [],
};

export class PayoutStateError extends Error {}

export function assertTransition(from: PayoutStatus, to: PayoutStatus): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new PayoutStateError(
      `Illegal payout transition ${from} -> ${to}. ` +
        `Legal from ${from}: ${ALLOWED_TRANSITIONS[from].join(", ") || "(terminal)"}`
    );
  }
}

export function canTransition(from: PayoutStatus, to: PayoutStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

// ============================================================
// The transfer seam
// ============================================================

export interface TransferRequest {
  contributorId: string;
  destinationAccountId: string;
  amountMinor: bigint;
  currency: string;
  /**
   * Stable key the provider uses to collapse duplicate submissions. Derived
   * from the payout id, so a retry after an ambiguous failure cannot pay twice.
   */
  idempotencyKey: string;
  description: string;
  metadata: Record<string, string>;
}

export interface TransferResult {
  status: "succeeded" | "failed";
  transferId?: string;
  failureReason?: string;
}

export interface TransferExecutor {
  execute(request: TransferRequest): Promise<TransferResult>;
}

/**
 * Records what it was asked to do and succeeds. For tests and dry runs.
 *
 * `failFor` makes partial-batch failure — the case the state machine exists for
 * — reproducible without breaking a real Stripe account.
 */
export class FixtureTransferExecutor implements TransferExecutor {
  readonly requests: TransferRequest[] = [];

  constructor(private readonly failFor: Set<string> = new Set()) {}

  async execute(request: TransferRequest): Promise<TransferResult> {
    this.requests.push(request);

    if (this.failFor.has(request.contributorId)) {
      return { status: "failed", failureReason: "Fixture: destination account restricted" };
    }

    // Derived from the idempotency key, not a counter. This mirrors how a real
    // provider behaves — the same key yields the same transfer — and it means
    // two executor instances can never mint the same id for different payouts,
    // which `engine_payouts_stripe_transfer_unique` would (correctly) reject.
    return { status: "succeeded", transferId: `tr_fixture_${request.idempotencyKey}` };
  }
}

/**
 * Refuses to move money. The default when no provider is configured.
 *
 * Mirrors the cost-resolver factory's stance: with no credentials, the correct
 * behaviour is to fail loudly rather than to appear to have paid someone.
 */
export class UnconfiguredTransferExecutor implements TransferExecutor {
  async execute(): Promise<TransferResult> {
    return {
      status: "failed",
      failureReason:
        "No transfer provider configured. Refusing to mark a payout paid without executing it.",
    };
  }
}

// ============================================================
// Batch selection
// ============================================================

export interface PayoutCandidate {
  contributorId: string;
  contributorName: string;
  destinationAccountId: string | null;
  /** What the ledger says is payable, before any advance is recouped. */
  payableMinor: bigint;
  /**
   * How much of `payableMinor` goes to paying down outstanding advances (§10b),
   * and which advances it goes to. Zero for every contributor without one, which
   * is almost all of them.
   */
  recoupment: RecoupmentPlan;
  /** `payableMinor` minus recoupment. This is what a transfer is sized on. */
  netPayableMinor: bigint;
  currency: string;
  /** Why this contributor was excluded, when they were. */
  skipReason?: string;
}

/**
 * Who is payable, and for how much, as of an instant.
 *
 * Held credits are excluded; debits always count. That asymmetry is what stops a
 * contributor with a fresh clawback and a still-held allocation being paid money
 * they no longer have.
 *
 * Advance recoupment is computed HERE rather than only inside `runPayoutBatch`,
 * because this is what the payout preview screen reads. An owner who is shown
 * "$400 to Alice" and then sees $250 leave has been lied to by the preview, and
 * the recoupment is the least intuitive number in the whole run — it is exactly
 * the one that has to appear before they press the button.
 */
export async function selectPayoutCandidates(
  db: EngineDb,
  tenantId: string,
  asOf: Date
): Promise<PayoutCandidate[]> {
  const [tenant] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, tenantId))
    .limit(1);

  if (!tenant) throw new Error(`Unknown tenant ${tenantId}`);

  const rows = await db
    .select({
      contributorId: schema.ledgerEntries.contributorId,
      currency: schema.ledgerEntries.currency,
      payable: sql<string>`COALESCE(SUM(${schema.ledgerEntries.amountMinor}), 0)`,
    })
    .from(schema.ledgerEntries)
    .where(
      and(
        eq(schema.ledgerEntries.tenantId, tenantId),
        or(
          lte(schema.ledgerEntries.amountMinor, 0n as any),
          sql`${schema.ledgerEntries.availableAt} IS NULL`,
          lte(schema.ledgerEntries.availableAt, asOf)
        )
      )
    )
    .groupBy(schema.ledgerEntries.contributorId, schema.ledgerEntries.currency);

  if (rows.length === 0) return [];

  const contributorIds = rows.map((r) => r.contributorId);

  const contributorRows = await db
    .select()
    .from(schema.contributors)
    .where(inArray(schema.contributors.id, contributorIds));

  const identityRows = await db
    .select()
    .from(schema.contributorIdentities)
    .where(inArray(schema.contributorIdentities.contributorId, contributorIds));

  const byId = new Map(contributorRows.map((c) => [c.id, c]));
  const identityById = new Map(identityRows.map((i) => [i.contributorId, i]));

  const minimum = BigInt(tenant.minimumPayoutMinor);
  const advancesByContributor = await loadOpenAdvances(db, tenantId, contributorIds);

  return rows.map((row) => {
    const payableMinor = BigInt(row.payable);
    const contributor = byId.get(row.contributorId);
    const identity = identityById.get(row.contributorId);

    // A deleted contributor is excluded from recoupment as well as from payment
    // — settling a debt against somebody who has been removed writes ledger
    // entries nobody will ever see or be able to query from a screen.
    const advances = contributor?.deletedAt
      ? []
      : (advancesByContributor.get(row.contributorId) ?? []).filter(
          (advance) => advance.currency === row.currency
        );

    const recoupment = planRecoupment(payableMinor, advances);

    const candidate: PayoutCandidate = {
      contributorId: row.contributorId,
      contributorName: contributor?.name ?? "(unknown)",
      destinationAccountId: identity?.stripeAccountId ?? null,
      payableMinor,
      recoupment,
      netPayableMinor: recoupment.netPayableMinor,
      currency: row.currency,
    };

    if (payableMinor <= 0n) {
      candidate.skipReason =
        payableMinor === 0n
          ? "Nothing payable"
          : `Negative balance ${formatMoney(payableMinor, row.currency)} — recouping against future earnings`;
    } else if (candidate.netPayableMinor <= 0n) {
      // Not a failure, and worded so it does not read as one: the money was not
      // withheld, it settled a debt. The recoupment still happens.
      candidate.skipReason =
        `All ${formatMoney(payableMinor, row.currency)} applied to their outstanding advance`;
    } else if (!identity?.stripeAccountId) {
      candidate.skipReason = "No payout account connected";
    } else if (!identity.stripePayoutsEnabled) {
      candidate.skipReason = "Payouts not enabled on the connected account";
    } else if (contributor?.deletedAt) {
      candidate.skipReason = "Contributor is deleted";
    } else if (candidate.netPayableMinor < minimum) {
      // Measured on the net, not the gross. Somebody whose earnings are mostly
      // recouped would otherwise pass a minimum they do not actually clear.
      candidate.skipReason =
        `Below the ${formatMoney(minimum, row.currency)} minimum — carried to the next run`;
    }

    return candidate;
  });
}

/**
 * Apply a contributor's recoupment plan to the ledger.
 *
 * One negative `advance_recoupment` entry per advance, each pointing at the
 * advance it pays down. Those entries are the only record of how much of an
 * advance has been recovered (§10b decision 7), so they are written inside the
 * caller's transaction wherever one exists.
 *
 * `availableAt` is null: a debit is never held. Same rule as a payout and a
 * reversal, and for the same reason — holds exist to delay paying money out, not
 * to delay taking it back.
 */
async function applyRecoupment(
  tx: EngineDb,
  options: {
    tenantId: string;
    contributorId: string;
    currency: string;
    plan: RecoupmentPlan;
    occurredAt: Date;
  }
): Promise<void> {
  for (const application of options.plan.applications) {
    await tx.insert(schema.ledgerEntries).values({
      tenantId: options.tenantId,
      contributorId: options.contributorId,
      entryType: "advance_recoupment",
      amountMinor: -application.amountMinor,
      currency: options.currency,
      advanceId: application.advanceId,
      availableAt: null,
      description:
        `${formatMoney(application.amountMinor, options.currency)} applied to your advance` +
        (application.remainingMinor > 0n
          ? ` — ${formatMoney(application.remainingMinor, options.currency)} still to recoup`
          : " — now fully recouped"),
      occurredAt: options.occurredAt,
    });
  }
}

// ============================================================
// Batch execution
// ============================================================

export interface BatchResult {
  batchId: string;
  status: PayoutBatchStatus;
  paid: number;
  failed: number;
  skipped: number;
  totalPaidMinor: bigint;
  totalReservedMinor: bigint;
  /**
   * What went to paying down advances rather than to contributors (§10b). Its
   * own line because it is the one figure in a run that reduces what people
   * receive without anything having failed.
   */
  totalRecoupedMinor: bigint;
  recouped: Array<{ contributorId: string; name: string; amountMinor: bigint }>;
  skipped_reasons: Array<{ contributorId: string; reason: string }>;
  /**
   * Why each failed payout failed. Surfaced to the owner: "2 failed" with no
   * reason reads as a broken system, when the actual cause is usually something
   * they can fix (no provider connected, a frozen account).
   */
  failures: Array<{ contributorId: string; name: string; reason: string }>;
}

/**
 * Create and execute a payout batch.
 *
 * Each contributor is independent: one failure does not abort the batch, and the
 * batch's own terminal state records whether any failed. A contributor whose
 * transfer fails keeps their ledger balance — nothing is debited unless the
 * transfer actually succeeded.
 */
export async function runPayoutBatch(
  db: EngineDb,
  options: {
    tenantId: string;
    asOf: Date;
    executor: TransferExecutor;
    createdBy?: string;
    /** Compute and report without moving money or writing ledger entries. */
    dryRun?: boolean;
  }
): Promise<BatchResult> {
  const [tenant] = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.id, options.tenantId))
    .limit(1);

  if (!tenant) throw new Error(`Unknown tenant ${options.tenantId}`);

  const candidates = await selectPayoutCandidates(db, options.tenantId, options.asOf);
  const eligible = candidates.filter((c) => !c.skipReason);
  const skipped = candidates.filter((c) => c.skipReason);

  const [batch] = await db
    .insert(schema.payoutBatches)
    .values({
      tenantId: options.tenantId,
      status: options.dryRun ? "cancelled" : "processing",
      availableAsOf: options.asOf,
      currency: tenant.defaultCurrency,
      startedAt: new Date(),
      createdBy: options.createdBy ?? null,
    })
    .returning({ id: schema.payoutBatches.id });

  const result: BatchResult = {
    batchId: batch.id,
    status: "processing",
    paid: 0,
    failed: 0,
    skipped: skipped.length,
    totalPaidMinor: 0n,
    totalReservedMinor: 0n,
    totalRecoupedMinor: 0n,
    recouped: [],
    skipped_reasons: skipped.map((c) => ({
      contributorId: c.contributorId,
      reason: c.skipReason!,
    })),
    failures: [],
  };

  // Advance recoupment, for EVERY candidate with a plan — not just the ones
  // being transferred to (§10b decision 4). A contributor whose whole payable
  // amount recoups is never paid, so gating recoupment on a successful transfer
  // would leave their advance outstanding forever.
  const recouping = candidates.filter((c) => c.recoupment.totalMinor > 0n);

  if (!options.dryRun && recouping.length > 0) {
    await db.transaction(async (tx) => {
      for (const candidate of recouping) {
        // The cast mirrors `ingest.ts`: a drizzle transaction inserts exactly
        // like a database handle but is not that type.
        await applyRecoupment(tx as unknown as EngineDb, {
          tenantId: options.tenantId,
          contributorId: candidate.contributorId,
          currency: candidate.currency,
          plan: candidate.recoupment,
          occurredAt: options.asOf,
        });
      }
    });
  }

  for (const candidate of recouping) {
    result.totalRecoupedMinor += candidate.recoupment.totalMinor;
    result.recouped.push({
      contributorId: candidate.contributorId,
      name: candidate.contributorName,
      amountMinor: candidate.recoupment.totalMinor,
    });
  }

  if (options.dryRun) {
    return { ...result, status: "cancelled" };
  }

  for (const candidate of eligible) {
    // Sized on the NET. The recoupment has already left the ledger above, so
    // transferring the gross would pay out money the contributor no longer has.
    const reserveMinor = reserveForPayout(
      candidate.netPayableMinor,
      tenant.clawbackPolicy as ClawbackPolicy,
      tenant.reserveBasisPoints
    );
    const transferMinor = candidate.netPayableMinor - reserveMinor;

    if (transferMinor <= 0n) {
      result.skipped += 1;
      result.skipped_reasons.push({
        contributorId: candidate.contributorId,
        reason: "Entire payable amount withheld as reserve",
      });
      continue;
    }

    const reserveReleaseAt = reserveMinor > 0n ? new Date(options.asOf.getTime()) : null;
    if (reserveReleaseAt) {
      reserveReleaseAt.setUTCDate(reserveReleaseAt.getUTCDate() + tenant.reserveReleaseDays);
    }

    // The payout row exists before the transfer is attempted, so an id always
    // has somewhere to land.
    const [payout] = await db
      .insert(schema.payouts)
      .values({
        tenantId: options.tenantId,
        batchId: batch.id,
        contributorId: candidate.contributorId,
        status: "pending",
        amountMinor: transferMinor,
        currency: candidate.currency,
        reserveHeldMinor: reserveMinor,
        reserveReleaseAt,
      })
      .returning({ id: schema.payouts.id });

    assertTransition("pending", "processing");
    await db
      .update(schema.payouts)
      .set({ status: "processing", initiatedAt: new Date(), attemptCount: 1 })
      .where(eq(schema.payouts.id, payout.id));

    const transfer = await options.executor.execute({
      contributorId: candidate.contributorId,
      destinationAccountId: candidate.destinationAccountId!,
      amountMinor: transferMinor,
      currency: candidate.currency,
      // Keyed on the payout row, so a retry after an ambiguous failure is
      // collapsed by the provider rather than paying twice.
      idempotencyKey: `payout_${payout.id}`,
      description: `Payout ${formatMoney(transferMinor, candidate.currency)} to ${candidate.contributorName}`,
      metadata: {
        tenantId: options.tenantId,
        payoutId: payout.id,
        batchId: batch.id,
        contributorId: candidate.contributorId,
      },
    });

    if (transfer.status === "failed") {
      assertTransition("processing", "failed");
      await db
        .update(schema.payouts)
        .set({ status: "failed", failureReason: transfer.failureReason ?? "Transfer failed" })
        .where(eq(schema.payouts.id, payout.id));

      // No ledger entry. The contributor keeps their balance and rolls into
      // the next run.
      result.failed += 1;
      result.failures.push({
        contributorId: candidate.contributorId,
        name: candidate.contributorName,
        reason: transfer.failureReason ?? "Transfer failed",
      });
      continue;
    }

    // Debit the ledger and mark paid together — a paid payout without its
    // ledger entry would let the same balance be paid again.
    await db.transaction(async (tx) => {
      await tx
        .update(schema.payouts)
        .set({
          status: "paid",
          stripeTransferId: transfer.transferId ?? null,
          completedAt: new Date(),
        })
        .where(eq(schema.payouts.id, payout.id));

      await tx.insert(schema.ledgerEntries).values({
        tenantId: options.tenantId,
        contributorId: candidate.contributorId,
        entryType: "payout",
        amountMinor: -transferMinor,
        currency: candidate.currency,
        payoutId: payout.id,
        availableAt: null,
        description: `Payout ${payout.id}${
          reserveMinor > 0n ? ` (${formatMoney(reserveMinor, candidate.currency)} held as reserve)` : ""
        }`,
        occurredAt: options.asOf,
      });
    });

    assertTransition("processing", "paid");
    result.paid += 1;
    result.totalPaidMinor += transferMinor;
    result.totalReservedMinor += reserveMinor;
  }

  const finalStatus: PayoutBatchStatus =
    result.failed > 0 ? "completed_with_failures" : "completed";

  await db
    .update(schema.payoutBatches)
    .set({ status: finalStatus, completedAt: new Date() })
    .where(eq(schema.payoutBatches.id, batch.id));

  return { ...result, status: finalStatus };
}

/**
 * Retry a failed payout.
 *
 * Goes through `failed -> retrying -> processing` rather than straight back to
 * `processing`, so the history shows that a retry happened. The provider
 * idempotency key is unchanged — if the original transfer actually succeeded
 * and we merely lost the response, the provider collapses the retry instead of
 * paying twice.
 */
export async function retryPayout(
  db: EngineDb,
  payoutId: string,
  executor: TransferExecutor
): Promise<{ status: PayoutStatus; transferId?: string; failureReason?: string }> {
  const [payout] = await db
    .select()
    .from(schema.payouts)
    .where(eq(schema.payouts.id, payoutId))
    .limit(1);

  if (!payout) throw new Error(`Unknown payout ${payoutId}`);

  assertTransition(payout.status as PayoutStatus, "retrying");

  const [identity] = await db
    .select()
    .from(schema.contributorIdentities)
    .where(eq(schema.contributorIdentities.contributorId, payout.contributorId))
    .limit(1);

  if (!identity?.stripeAccountId) {
    return { status: "failed", failureReason: "No payout account connected" };
  }

  await db
    .update(schema.payouts)
    .set({ status: "retrying", attemptCount: payout.attemptCount + 1 })
    .where(eq(schema.payouts.id, payoutId));

  assertTransition("retrying", "processing");
  await db
    .update(schema.payouts)
    .set({ status: "processing" })
    .where(eq(schema.payouts.id, payoutId));

  const amountMinor = BigInt(payout.amountMinor);

  const transfer = await executor.execute({
    contributorId: payout.contributorId,
    destinationAccountId: identity.stripeAccountId,
    amountMinor,
    currency: payout.currency,
    idempotencyKey: `payout_${payout.id}`,
    description: `Retry payout ${formatMoney(amountMinor, payout.currency)}`,
    metadata: {
      tenantId: payout.tenantId,
      payoutId: payout.id,
      contributorId: payout.contributorId,
      retry: "true",
    },
  });

  if (transfer.status === "failed") {
    assertTransition("processing", "failed");
    await db
      .update(schema.payouts)
      .set({ status: "failed", failureReason: transfer.failureReason ?? "Transfer failed" })
      .where(eq(schema.payouts.id, payoutId));
    return { status: "failed", failureReason: transfer.failureReason };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(schema.payouts)
      .set({
        status: "paid",
        stripeTransferId: transfer.transferId ?? null,
        completedAt: new Date(),
      })
      .where(eq(schema.payouts.id, payoutId));

    await tx.insert(schema.ledgerEntries).values({
      tenantId: payout.tenantId,
      contributorId: payout.contributorId,
      entryType: "payout",
      amountMinor: -amountMinor,
      currency: payout.currency,
      payoutId: payout.id,
      availableAt: null,
      description: `Payout ${payout.id} (retry)`,
      occurredAt: new Date(),
    });
  });

  return { status: "paid", transferId: transfer.transferId };
}
