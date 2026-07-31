/**
 * HTTP routes for the engine — the contributor portal.
 *
 * A SEPARATE ROUTER, mounted rather than merged into `server/routes.ts`. The
 * engine and the marketplace are deliberately unlinked (ratified decision #9),
 * and that has to hold at the HTTP layer too: when the marketplace routes are
 * deleted in Phase 2, nothing here should need touching.
 *
 * TENANT RESOLUTION IS IN THE PATH: `/api/engine/t/:tenantSlug/...`
 *
 * Explicit rather than inferred. Subdomain routing is nicer to look at but it
 * makes the tenant depend on deployment configuration, and a request that
 * reaches the wrong tenant in a payouts product is a data breach rather than a
 * bug. Having it in the path means every handler can see it and the tests can
 * exercise cross-tenant access directly.
 *
 * Amounts are serialised as STRINGS, never JSON numbers. `JSON.stringify`
 * cannot represent a bigint at all, and coercing to `number` would silently
 * round any amount above 2^53 — the exact failure the bigint columns exist to
 * prevent. The client formats from the string.
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import rateLimit from "express-rate-limit";

import * as schema from "@shared/engine-schema";
import {
  assertCanReadContributor,
  authenticateContributor,
  AuthError,
  loadSessionContributor,
} from "./auth";
import type { EngineDb } from "./ingest";
import { deriveContributorBalance, derivePayableBalance } from "./ingest";
import { formatMinor } from "./money";
import { getPayoutHistory, getStatement } from "./statement-query";
import type { Statement } from "./statement";

/** Login is the one endpoint worth rate-limiting — it is the guessable one. */
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

export function createEngineRouter(db: EngineDb): Router {
  const router = Router({ mergeParams: true });

  /**
   * Resolve `:tenantSlug` to a tenant, once, for everything beneath it.
   *
   * An unknown slug is a 404 rather than a 400 — it should be indistinguishable
   * from a tenant that exists but that the caller has no business knowing about.
   */
  async function resolveTenant(req: TenantRequest, res: Response, next: NextFunction) {
    const slug = String(req.params.tenantSlug ?? "");
    const [tenant] = await db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.slug, slug))
      .limit(1);

    if (!tenant) {
      return res.status(404).json({ message: "Not found" });
    }

    req.engineTenant = {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      currency: tenant.defaultCurrency,
    };
    next();
  }

  /**
   * Require a contributor session belonging to THIS tenant.
   *
   * Re-loads the contributor on every request rather than trusting the session
   * blob, so deactivating someone cuts their access immediately rather than at
   * their next login.
   */
  async function requireContributor(req: TenantRequest, res: Response, next: NextFunction) {
    const session = req.session.engineContributor;
    const tenant = req.engineTenant!;

    if (!session || session.tenantId !== tenant.id) {
      return res.status(401).json({ message: "Not signed in" });
    }

    const contributor = await loadSessionContributor(db, tenant.id, session.contributorId);
    if (!contributor) {
      // Deleted, deactivated, or moved tenants since the session was issued.
      req.session.engineContributor = undefined;
      return res.status(401).json({ message: "Not signed in" });
    }

    next();
  }

  router.use("/t/:tenantSlug", resolveTenant);

  // ---- Auth ----

  router.get("/t/:tenantSlug", (req: TenantRequest, res) => {
    const tenant = req.engineTenant!;
    res.json({ name: tenant.name, slug: tenant.slug, currency: tenant.currency });
  });

  router.post("/t/:tenantSlug/login", loginLimiter, async (req: TenantRequest, res) => {
    const tenant = req.engineTenant!;
    const { email, password } = req.body ?? {};

    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const session = await authenticateContributor(db, tenant.id, email, password);

    // One message for every failure mode. Distinguishing "no such email" from
    // "wrong password" lets an attacker enumerate who works for a tenant.
    if (!session) {
      return res.status(401).json({ message: "Incorrect email or password" });
    }

    req.session.engineContributor = {
      contributorId: session.contributorId,
      tenantId: session.tenantId,
      tenantSlug: tenant.slug,
      name: session.name,
      email: session.email,
    };

    res.json({
      contributorId: session.contributorId,
      name: session.name,
      email: session.email,
      tenant: { name: tenant.name, slug: tenant.slug },
    });
  });

  router.post("/t/:tenantSlug/logout", (req, res) => {
    req.session.engineContributor = undefined;
    res.json({ ok: true });
  });

  router.get(
    "/t/:tenantSlug/me",
    requireContributor,
    async (req: TenantRequest, res) => {
      const tenant = req.engineTenant!;
      const session = req.session.engineContributor!;

      const balanceMinor = await deriveContributorBalance(db, tenant.id, session.contributorId);
      const payableMinor = await derivePayableBalance(
        db,
        tenant.id,
        session.contributorId,
        new Date()
      );

      res.json({
        contributorId: session.contributorId,
        name: session.name,
        email: session.email,
        tenant: { name: tenant.name, slug: tenant.slug },
        currency: tenant.currency,
        // Strings, not numbers — see the note at the top of this file.
        balanceMinor: balanceMinor.toString(),
        balance: formatMinor(balanceMinor),
        payableMinor: payableMinor.toString(),
        payable: formatMinor(payableMinor),
        heldMinor: (balanceMinor > payableMinor
          ? balanceMinor - payableMinor
          : 0n
        ).toString(),
      });
    }
  );

  // ---- Statement ----

  router.get(
    "/t/:tenantSlug/statement",
    requireContributor,
    async (req: TenantRequest, res) => {
      const tenant = req.engineTenant!;
      const session = req.session.engineContributor!;

      const now = new Date();
      const periodStart = req.query.from
        ? new Date(String(req.query.from))
        : new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      const periodEnd = req.query.to
        ? new Date(String(req.query.to))
        : new Date(Date.UTC(now.getUTCFullYear(), 11, 31, 23, 59, 59));

      if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
        return res.status(400).json({ message: "Invalid date range" });
      }

      // Belt and braces: the session already pins the contributor, but the
      // guard makes the intent explicit and survives someone later adding a
      // `?contributorId=` parameter to this endpoint.
      try {
        assertCanReadContributor(
          {
            contributorId: session.contributorId,
            tenantId: session.tenantId,
            name: session.name,
            email: session.email,
          },
          tenant.id,
          session.contributorId
        );
      } catch (error) {
        if (error instanceof AuthError) {
          return res.status(403).json({ message: error.message });
        }
        throw error;
      }

      const statement = await getStatement(db, {
        tenantId: tenant.id,
        contributorId: session.contributorId,
        periodStart,
        periodEnd,
        // asOf is "now" for a live view — a contributor looking today should
        // see what is held today. Reproducing a past statement passes an
        // explicit asOf via the query layer.
        asOf: now,
      });

      res.json(serialiseStatement(statement));
    }
  );

  // ---- Payout history ----

  router.get(
    "/t/:tenantSlug/payouts",
    requireContributor,
    async (req: TenantRequest, res) => {
      const tenant = req.engineTenant!;
      const session = req.session.engineContributor!;

      const history = await getPayoutHistory(db, tenant.id, session.contributorId);

      res.json({
        payouts: history.map((payout) => ({
          id: payout.id,
          status: payout.status,
          amountMinor: payout.amountMinor.toString(),
          amount: formatMinor(payout.amountMinor),
          currency: payout.currency,
          reserveHeldMinor: payout.reserveHeldMinor.toString(),
          // The provider transfer id is deliberately NOT exposed. It is an
          // internal reconciliation handle, not something a contributor needs,
          // and it identifies the tenant's payment infrastructure.
          failureReason: payout.failureReason,
          completedAt: payout.completedAt,
          createdAt: payout.createdAt,
        })),
      });
    }
  );

  return router;
}

/** Convert a statement's bigints to strings for JSON. */
function serialiseStatement(statement: Statement) {
  const money = (amount: bigint) => ({
    minor: amount.toString(),
    formatted: formatMinor(amount),
  });

  return {
    contributorId: statement.contributorId,
    contributorName: statement.contributorName,
    tenantName: statement.tenantName,
    currency: statement.currency,
    periodStart: statement.periodStart,
    periodEnd: statement.periodEnd,
    openingBalance: money(statement.openingBalanceMinor),
    lines: statement.lines.map((line) => ({
      occurredAt: line.occurredAt,
      type: line.type,
      amount: money(line.amountMinor),
      // The stored derivation, verbatim. This is the product.
      explanation: line.explanation,
      trace: line.trace,
      ruleKey: line.ruleKey,
      ruleVersion: line.ruleVersion,
      workTitle: line.workTitle,
      availableAt: line.availableAt,
      held: line.held,
    })),
    totals: {
      earned: money(statement.totals.earnedMinor),
      reversed: money(statement.totals.reversedMinor),
      adjustments: money(statement.totals.adjustmentsMinor),
      paidOut: money(statement.totals.paidOutMinor),
      closingBalance: money(statement.totals.closingBalanceMinor),
      payableNow: money(statement.totals.payableNowMinor),
      held: money(statement.totals.heldMinor),
    },
    summary: statement.summary,
  };
}
