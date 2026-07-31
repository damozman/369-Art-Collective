/**
 * Admin HTTP API — the tenant owner's surface.
 *
 * Mounted under the same `/api/engine/t/:tenantSlug` prefix as the contributor
 * portal, but under `/admin/*` and behind a different session
 * (`session.engineAdmin`, never `engineContributor`). A contributor cookie can
 * never reach any of these endpoints.
 *
 * Same money rule as everywhere else: amounts serialise as STRINGS. A JSON
 * number cannot hold a bigint safely, and the admin screens show larger totals
 * than any single statement does — so this is the surface where a float would
 * break first.
 *
 * WRITE ENDPOINTS ARE FEW AND EXPLICIT. Reading is broad; the only things that
 * change state are running a payout batch and retrying a failed payout. Rule
 * editing is deliberately absent — blueprint §9 puts the split-rule builder in
 * Phase 3, and a half-built rule editor is a way to silently change what people
 * are paid.
 */

import { Router, type NextFunction, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import rateLimit from "express-rate-limit";

import * as schema from "@shared/engine-schema";
import {
  assertCanWrite,
  authenticateTenantUser,
  loadAdminSession,
  type AdminSession,
} from "./admin-auth";
import {
  getOverview,
  listContributors,
  listNeedsReview,
  listPayoutBatches,
  listRules,
  listWorks,
} from "./admin-query";
import {
  AdminValidationError,
  createContributor,
  createRule,
  createWork,
  deactivateRule,
  linkWorkContributor,
  supersedeRule,
  updateContributor,
} from "./admin-mutations";
import { dismissReview, resolveEventContributor, writeOffDeficit } from "./review";
import { AuthError } from "./auth";
import type { EngineDb } from "./ingest";
import { formatMinor } from "./money";
import {
  retryPayout,
  runPayoutBatch,
  selectPayoutCandidates,
  UnconfiguredTransferExecutor,
  type TransferExecutor,
} from "./payout";

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts. Try again in 15 minutes." },
});

interface TenantRequest extends Request {
  engineTenant?: { id: string; slug: string; name: string; currency: string };
}

/** Money for the wire: string minor units plus a preformatted decimal. */
const money = (amount: bigint) => ({
  minor: amount.toString(),
  formatted: formatMinor(amount),
});

/**
 * How transfers are executed for admin-triggered payout runs.
 *
 * RESOLVED PER TENANT, NOT ONCE PER PROCESS. Transfers are instructed against
 * the tenant's own connected Stripe account — we never hold the funds (ratified
 * decision #1) — so a single shared executor would send one tenant's payouts
 * out of another tenant's balance. The lookup is cheap and the alternative is
 * unrecoverable.
 *
 * Still defaults to refusing, exactly like the cost resolver refuses to invent
 * costs: with no Stripe key configured, `getTransferExecutor` returns the
 * unconfigured executor and an admin who clicks "run payouts" gets honest
 * failures rather than payouts that look successful and moved nothing.
 */
export function createAdminRouter(
  db: EngineDb,
  options: {
    /** Overrides everything. Tests and dry runs only. */
    transferExecutor?: TransferExecutor;
  } = {}
): Router {
  const router = Router({ mergeParams: true });

  async function executorForTenant(tenantId: string): Promise<TransferExecutor> {
    if (options.transferExecutor) return options.transferExecutor;

    const [tenant] = await db
      .select({ stripeAccountId: schema.tenants.stripeAccountId })
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1);

    if (!tenant) return new UnconfiguredTransferExecutor();

    const { getTransferExecutor } = await import("./adapters/stripe/factory");
    return getTransferExecutor({ tenantStripeAccountId: tenant.stripeAccountId });
  }

  async function resolveTenant(req: TenantRequest, res: Response, next: NextFunction) {
    const slug = String(req.params.tenantSlug ?? "");
    const [tenant] = await db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.slug, slug))
      .limit(1);

    if (!tenant) return res.status(404).json({ message: "Not found" });

    req.engineTenant = {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      currency: tenant.defaultCurrency,
    };
    next();
  }

  async function requireAdmin(req: TenantRequest, res: Response, next: NextFunction) {
    const stored = req.session.engineAdmin;
    const tenant = req.engineTenant!;

    if (!stored || stored.tenantId !== tenant.id) {
      return res.status(401).json({ message: "Not signed in" });
    }

    const session = await loadAdminSession(
      db,
      tenant.id,
      tenant.slug,
      stored.tenantUserId
    );

    if (!session) {
      req.session.engineAdmin = undefined;
      return res.status(401).json({ message: "Not signed in" });
    }

    (req as TenantRequest & { adminSession?: AdminSession }).adminSession = session;
    next();
  }

  router.use("/t/:tenantSlug/admin", resolveTenant);

  // ---- Auth ----

  router.post("/t/:tenantSlug/admin/login", loginLimiter, async (req: TenantRequest, res) => {
    const tenant = req.engineTenant!;
    const { email, password } = req.body ?? {};

    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const session = await authenticateTenantUser(
      db,
      tenant.id,
      tenant.slug,
      email,
      password
    );

    if (!session) {
      return res.status(401).json({ message: "Incorrect email or password" });
    }

    req.session.engineAdmin = {
      tenantUserId: session.tenantUserId,
      tenantId: session.tenantId,
      tenantSlug: tenant.slug,
      name: session.name,
      email: session.email,
      role: session.role,
    };

    res.json({
      name: session.name,
      email: session.email,
      role: session.role,
      tenant: { name: tenant.name, slug: tenant.slug },
    });
  });

  router.post("/t/:tenantSlug/admin/logout", (req, res) => {
    req.session.engineAdmin = undefined;
    res.json({ ok: true });
  });

  router.get("/t/:tenantSlug/admin/me", requireAdmin, (req: TenantRequest, res) => {
    const tenant = req.engineTenant!;
    const session = req.session.engineAdmin!;
    res.json({
      name: session.name,
      email: session.email,
      role: session.role,
      tenant: { name: tenant.name, slug: tenant.slug, currency: tenant.currency },
    });
  });

  // ---- Dashboard ----

  router.get("/t/:tenantSlug/admin/overview", requireAdmin, async (req: TenantRequest, res) => {
    const tenant = req.engineTenant!;
    const overview = await getOverview(db, tenant.id, new Date());

    res.json({
      currency: overview.currency,
      gross: money(overview.grossMinor),
      allocated: money(overview.allocatedMinor),
      paidOut: money(overview.paidOutMinor),
      outstanding: money(overview.outstandingMinor),
      held: money(overview.heldMinor),
      payableNow: money(overview.payableNowMinor),
      counts: {
        events: overview.eventCount,
        needsReview: overview.needsReviewCount,
        contributors: overview.contributorCount,
        negativeBalances: overview.negativeBalanceCount,
        failedPayouts: overview.failedPayoutCount,
      },
    });
  });

  // ---- Contributors ----

  router.get(
    "/t/:tenantSlug/admin/contributors",
    requireAdmin,
    async (req: TenantRequest, res) => {
      const tenant = req.engineTenant!;
      const [row] = await db
        .select()
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenant.id))
        .limit(1);

      const contributors = await listContributors(
        db,
        tenant.id,
        new Date(),
        BigInt(row.minimumPayoutMinor)
      );

      res.json({
        currency: tenant.currency,
        minimumPayout: money(BigInt(row.minimumPayoutMinor)),
        contributors: contributors.map((c) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          externalRef: c.externalRef,
          active: c.active,
          balance: money(c.balanceMinor),
          payable: money(c.payableMinor),
          hasPayoutAccount: c.hasPayoutAccount,
          payoutsEnabled: c.payoutsEnabled,
          blockedReason: c.blockedReason,
        })),
      });
    }
  );

  // ---- Needs review ----

  router.get("/t/:tenantSlug/admin/review", requireAdmin, async (req: TenantRequest, res) => {
    const tenant = req.engineTenant!;
    const rows = await listNeedsReview(db, tenant.id);

    res.json({
      currency: tenant.currency,
      items: rows.map((row) => ({
        id: row.id,
        source: row.source,
        sourceEventId: row.sourceEventId,
        occurredAt: row.occurredAt,
        gross: money(row.grossMinor),
        reason: row.reviewReason,
        workRef: row.workRef,
      })),
    });
  });

  // ---- Rules (read-only in Phase 1) ----

  router.get("/t/:tenantSlug/admin/rules", requireAdmin, async (req: TenantRequest, res) => {
    const tenant = req.engineTenant!;
    const rules = await listRules(db, tenant.id);

    res.json({
      rules: rules.map((rule) => ({
        id: rule.id,
        ruleKey: rule.ruleKey,
        version: rule.version,
        effectiveFrom: rule.effectiveFrom,
        effectiveTo: rule.effectiveTo,
        scope: rule.scope,
        contributorName: rule.contributorName,
        basis: rule.basis,
        method: rule.method,
        rate: rule.valueBasisPoints === null ? null : rule.valueBasisPoints / 100,
        flatAmount: rule.valueMinor === null ? null : money(rule.valueMinor),
        costDeductions: rule.costDeductions,
        priority: rule.priority,
        active: rule.active,
        description: rule.description,
      })),
    });
  });

  // ---- Payouts ----

  router.get("/t/:tenantSlug/admin/payouts", requireAdmin, async (req: TenantRequest, res) => {
    const tenant = req.engineTenant!;
    const batches = await listPayoutBatches(db, tenant.id);

    res.json({
      currency: tenant.currency,
      batches: batches.map((batch) => ({
        id: batch.id,
        status: batch.status,
        availableAsOf: batch.availableAsOf,
        completedAt: batch.completedAt,
        createdAt: batch.createdAt,
        payoutCount: batch.payoutCount,
        paidCount: batch.paidCount,
        failedCount: batch.failedCount,
        totalPaid: money(batch.totalPaidMinor),
      })),
    });
  });

  /**
   * Preview a payout run without moving anything.
   *
   * Deliberately a separate endpoint from running one, and the screen shows this
   * first. "Who would be paid, and who would be skipped and why" is the question
   * an owner actually has before releasing money, and answering it must carry no
   * risk of accidentally answering it by doing it.
   */
  router.get(
    "/t/:tenantSlug/admin/payouts/preview",
    requireAdmin,
    async (req: TenantRequest, res) => {
      const tenant = req.engineTenant!;
      const candidates = await selectPayoutCandidates(db, tenant.id, new Date());

      const eligible = candidates.filter((c) => !c.skipReason);
      const skipped = candidates.filter((c) => c.skipReason);

      res.json({
        currency: tenant.currency,
        totalToPay: money(eligible.reduce((sum, c) => sum + c.payableMinor, 0n)),
        eligible: eligible.map((c) => ({
          contributorId: c.contributorId,
          name: c.contributorName,
          amount: money(c.payableMinor),
        })),
        skipped: skipped.map((c) => ({
          contributorId: c.contributorId,
          name: c.contributorName,
          amount: money(c.payableMinor),
          reason: c.skipReason,
        })),
      });
    }
  );

  router.post(
    "/t/:tenantSlug/admin/payouts/run",
    requireAdmin,
    async (req: TenantRequest, res) => {
      const tenant = req.engineTenant!;
      const session = (req as TenantRequest & { adminSession?: AdminSession }).adminSession!;

      try {
        assertCanWrite(session);
      } catch (error) {
        if (error instanceof AuthError) {
          return res.status(403).json({ message: error.message });
        }
        throw error;
      }

      const result = await runPayoutBatch(db, {
        tenantId: tenant.id,
        asOf: new Date(),
        executor: await executorForTenant(tenant.id),
        createdBy: session.tenantUserId,
      });

      res.json({
        batchId: result.batchId,
        status: result.status,
        paid: result.paid,
        failed: result.failed,
        skipped: result.skipped,
        totalPaid: money(result.totalPaidMinor),
        skippedReasons: result.skipped_reasons,
        failures: result.failures,
      });
    }
  );

  router.post(
    "/t/:tenantSlug/admin/payouts/:payoutId/retry",
    requireAdmin,
    async (req: TenantRequest, res) => {
      const tenant = req.engineTenant!;
      const session = (req as TenantRequest & { adminSession?: AdminSession }).adminSession!;

      try {
        assertCanWrite(session);
      } catch (error) {
        if (error instanceof AuthError) {
          return res.status(403).json({ message: error.message });
        }
        throw error;
      }

      const payoutId = String(req.params.payoutId);

      // Confirm the payout belongs to THIS tenant before touching it. Without
      // this an admin could retry another tenant's payout by guessing an id.
      const [payout] = await db
        .select()
        .from(schema.payouts)
        .where(eq(schema.payouts.id, payoutId))
        .limit(1);

      if (!payout || payout.tenantId !== tenant.id) {
        return res.status(404).json({ message: "Not found" });
      }

      const result = await retryPayout(db, payoutId, await executorForTenant(tenant.id));
      res.json(result);
    }
  );

  /**
   * Shared wrapper for every write endpoint.
   *
   * Centralises the role check and the validation-error translation so a new
   * write route cannot forget either — forgetting the role check is how a
   * read-only bookkeeper ends up able to change what people are paid.
   */
  function write(
    handler: (req: TenantRequest, res: Response, session: AdminSession) => Promise<void>
  ) {
    return async (req: TenantRequest, res: Response) => {
      const session = (req as TenantRequest & { adminSession?: AdminSession }).adminSession!;

      try {
        assertCanWrite(session);
      } catch (error) {
        if (error instanceof AuthError) {
          return res.status(403).json({ message: error.message });
        }
        throw error;
      }

      try {
        await handler(req, res, session);
      } catch (error) {
        // Validation failures are the owner's mistake, not a server fault, and
        // their messages are written to be read by them.
        if (error instanceof AdminValidationError) {
          return res.status(400).json({ message: error.message });
        }
        throw error;
      }
    };
  }

  // ---- Rates: create and change ----

  router.post(
    "/t/:tenantSlug/admin/rules",
    requireAdmin,
    write(async (req, res, session) => {
      const tenant = req.engineTenant!;
      const body = req.body ?? {};

      const id = await createRule(
        db,
        tenant.id,
        {
          ruleKey: String(body.ruleKey ?? ""),
          scope: body.scope,
          scopeRef: body.scopeRef ?? null,
          contributorId: body.contributorId ?? null,
          role: body.role ?? null,
          basis: body.basis,
          method: body.method,
          percent: body.percent ?? null,
          flatMinor: body.flatMinor === undefined || body.flatMinor === null
            ? null
            : BigInt(body.flatMinor),
          tierTable: body.tierTable ?? null,
          costDeductions: body.costDeductions ?? [],
          priority: body.priority ?? 0,
          effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : undefined,
        },
        session.tenantUserId
      );

      res.status(201).json({ id });
    })
  );

  router.put(
    "/t/:tenantSlug/admin/rules/:ruleKey",
    requireAdmin,
    write(async (req, res, session) => {
      const tenant = req.engineTenant!;
      const body = req.body ?? {};

      const result = await supersedeRule(
        db,
        tenant.id,
        {
          ruleKey: String(req.params.ruleKey),
          scope: body.scope,
          scopeRef: body.scopeRef ?? null,
          contributorId: body.contributorId ?? null,
          role: body.role ?? null,
          basis: body.basis,
          method: body.method,
          percent: body.percent ?? null,
          flatMinor: body.flatMinor === undefined || body.flatMinor === null
            ? null
            : BigInt(body.flatMinor),
          tierTable: body.tierTable ?? null,
          costDeductions: body.costDeductions ?? [],
          priority: body.priority ?? 0,
          effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : undefined,
        },
        session.tenantUserId
      );

      res.json(result);
    })
  );

  router.post(
    "/t/:tenantSlug/admin/rules/:ruleKey/deactivate",
    requireAdmin,
    write(async (req, res) => {
      const tenant = req.engineTenant!;
      await deactivateRule(db, tenant.id, String(req.params.ruleKey));
      res.json({ ok: true });
    })
  );

  // ---- People ----

  router.post(
    "/t/:tenantSlug/admin/contributors",
    requireAdmin,
    write(async (req, res) => {
      const tenant = req.engineTenant!;
      const body = req.body ?? {};

      const id = await createContributor(db, tenant.id, {
        name: String(body.name ?? ""),
        email: body.email ?? null,
        externalRef: body.externalRef ?? null,
        password: body.password ?? null,
      });

      res.status(201).json({ id });
    })
  );

  router.patch(
    "/t/:tenantSlug/admin/contributors/:contributorId",
    requireAdmin,
    write(async (req, res) => {
      const tenant = req.engineTenant!;
      const body = req.body ?? {};

      await updateContributor(db, tenant.id, String(req.params.contributorId), {
        name: body.name,
        email: body.email,
        externalRef: body.externalRef,
        password: body.password,
        active: body.active,
      });

      res.json({ ok: true });
    })
  );

  // ---- Resolving review items ----

  router.post(
    "/t/:tenantSlug/admin/review/:eventId/assign",
    requireAdmin,
    write(async (req, res, session) => {
      const tenant = req.engineTenant!;
      const body = req.body ?? {};

      const result = await resolveEventContributor(db, {
        tenantId: tenant.id,
        eventId: String(req.params.eventId),
        contributorId: String(body.contributorId ?? ""),
        role: body.role ?? null,
        rememberReference: Boolean(body.rememberReference),
        actorId: session.tenantUserId,
      });

      res.json({
        status: result.status,
        allocated: money(result.totalAllocatedMinor),
        warnings: result.warnings,
      });
    })
  );

  router.post(
    "/t/:tenantSlug/admin/review/:eventId/dismiss",
    requireAdmin,
    write(async (req, res, session) => {
      const tenant = req.engineTenant!;
      await dismissReview(db, {
        tenantId: tenant.id,
        eventId: String(req.params.eventId),
        note: String((req.body ?? {}).note ?? ""),
        actorId: session.tenantUserId,
      });
      res.json({ ok: true });
    })
  );

  router.post(
    "/t/:tenantSlug/admin/contributors/:contributorId/write-off",
    requireAdmin,
    write(async (req, res, session) => {
      const tenant = req.engineTenant!;
      const body = req.body ?? {};

      const id = await writeOffDeficit(db, {
        tenantId: tenant.id,
        contributorId: String(req.params.contributorId),
        amountMinor: BigInt(body.amountMinor ?? 0),
        note: String(body.note ?? ""),
        actorId: session.tenantUserId,
      });

      res.json({ id });
    })
  );

  // ---- Works ----

  router.get("/t/:tenantSlug/admin/works", requireAdmin, async (req: TenantRequest, res) => {
    const tenant = req.engineTenant!;
    const works = await listWorks(db, tenant.id);
    res.json({ works });
  });

  router.post(
    "/t/:tenantSlug/admin/works",
    requireAdmin,
    write(async (req, res) => {
      const tenant = req.engineTenant!;
      const body = req.body ?? {};

      const id = await createWork(db, tenant.id, {
        title: String(body.title ?? ""),
        externalRef: body.externalRef ?? null,
        productType: body.productType ?? null,
      });

      res.status(201).json({ id });
    })
  );

  router.post(
    "/t/:tenantSlug/admin/works/:workId/contributors",
    requireAdmin,
    write(async (req, res) => {
      const tenant = req.engineTenant!;
      const body = req.body ?? {};

      await linkWorkContributor(
        db,
        tenant.id,
        String(req.params.workId),
        String(body.contributorId ?? ""),
        body.role ?? null
      );

      res.status(201).json({ ok: true });
    })
  );

  return router;
}
