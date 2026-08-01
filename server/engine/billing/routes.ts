/**
 * Signing up and paying — the public half, plus the tenant's billing screen.
 *
 * Split into two routers because they have different audiences and different
 * auth:
 *
 *   `createSignupRouter`  — no session. Anyone on the internet. Rate limited,
 *                           because an open account-creation endpoint is a
 *                           spam target.
 *   `createBillingRouter` — behind `engineAdmin`, mounted alongside the rest of
 *                           the owner console.
 *
 * Prices go out as strings in minor units plus a preformatted decimal, exactly
 * like every other amount in this system. They are small enough that a JSON
 * number would survive, which is precisely why the rule has to be mechanical
 * rather than applied where it seems to matter.
 */

import { Router, type NextFunction, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import rateLimit from "express-rate-limit";

import * as schema from "@shared/engine-schema";
import { loadAdminSession, assertCanWrite, type AdminSession } from "../admin-auth";
import { AuthError } from "../auth";
import type { EngineDb } from "../ingest";
import { formatMinor } from "../money";
import { getBillingClient } from "./billing-factory";
import { completeCheckout, startCheckout } from "./checkout";
import {
  ANNUAL_MONTHS_CHARGED,
  annualSavingMinor,
  selectablePlans,
  type BillingInterval,
} from "./plans";
import { SignupError, signUp } from "./signup";
import {
  SubscriptionError,
  changePlan,
  entitlement,
  getSubscription,
  getUsage,
  suggestDowngrade,
} from "./subscription";

const money = (amount: bigint) => ({
  minor: amount.toString(),
  formatted: formatMinor(amount),
});

function planPayload(plan: ReturnType<typeof selectablePlans>[number]) {
  return {
    key: plan.key,
    name: plan.name,
    blurb: plan.blurb,
    peopleLimit: plan.peopleLimit,
    currency: plan.currency,
    monthly: money(plan.priceMinor),
    annual: money(plan.annualPriceMinor),
    /** What the annual price works out at per month, for the comparison. */
    annualPerMonth: money(plan.annualPriceMinor / 12n),
    annualSaving: money(annualSavingMinor(plan)),
    monthsChargedAnnually: Number(ANNUAL_MONTHS_CHARGED),
  };
}

/**
 * Ten signups an hour per address. Generous for a human, useless for a script.
 * Deliberately not tighter: a shared office NAT can put several genuine
 * customers behind one address.
 */
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many sign-ups from here. Try again in an hour." },
});

export function createSignupRouter(db: EngineDb): Router {
  const router = Router();

  router.get("/plans", (_req, res) => {
    res.json({ plans: selectablePlans().map(planPayload) });
  });

  router.post("/signup", signupLimiter, async (req, res) => {
    const body = req.body ?? {};

    try {
      const result = await signUp(db, {
        businessName: String(body.businessName ?? ""),
        slug: body.slug ? String(body.slug) : undefined,
        name: String(body.name ?? ""),
        email: String(body.email ?? ""),
        password: String(body.password ?? ""),
        planKey: body.planKey ? String(body.planKey) : undefined,
        billingInterval:
          body.billingInterval === "annual" ? "annual" : "monthly",
      });

      // Signed in immediately. Making somebody who just chose a password type
      // it again is friction for no security gain — they proved they know it
      // by setting it thirty milliseconds ago.
      //
      // The session is built from `loadAdminSession` rather than from the form,
      // so the shape and the role come from the row that was actually written.
      if (!result.pendingApproval) {
        const session = await loadAdminSession(
          db,
          result.tenantId,
          result.tenantSlug,
          result.tenantUserId
        );

        if (session) {
          req.session.engineAdmin = {
            tenantUserId: session.tenantUserId,
            tenantId: session.tenantId,
            tenantSlug: result.tenantSlug,
            name: session.name,
            email: session.email,
            role: session.role,
          };
        }
      }

      res.status(201).json({
        tenantSlug: result.tenantSlug,
        trialEndsAt: result.trialEndsAt,
        pendingApproval: result.pendingApproval,
      });
    } catch (error) {
      if (error instanceof SignupError) {
        return res.status(400).json({ message: error.message });
      }
      // A duplicate email or a lost slug race lands here. The message stays
      // generic rather than confirming which addresses already have accounts.
      if (isUniqueViolation(error)) {
        return res.status(400).json({
          message: "That did not work. Try a different email address or business name.",
        });
      }
      throw error;
    }
  });

  return router;
}

interface TenantRequest extends Request {
  engineTenant?: { id: string; slug: string; name: string; currency: string };
}

export function createBillingRouter(db: EngineDb): Router {
  const router = Router({ mergeParams: true });

  async function resolveTenant(req: TenantRequest, res: Response, next: NextFunction) {
    const [tenant] = await db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.slug, String(req.params.tenantSlug ?? "")))
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

    const session = await loadAdminSession(db, tenant.id, tenant.slug, stored.tenantUserId);
    if (!session) {
      req.session.engineAdmin = undefined;
      return res.status(401).json({ message: "Not signed in" });
    }

    (req as TenantRequest & { adminSession?: AdminSession }).adminSession = session;
    next();
  }

  router.use("/t/:tenantSlug/admin/billing", resolveTenant);

  /** Everything the billing screen shows. */
  router.get(
    "/t/:tenantSlug/admin/billing",
    requireAdmin,
    async (req: TenantRequest, res) => {
      const tenant = req.engineTenant!;

      const subscription = await getSubscription(db, tenant.id);
      const usage = await getUsage(db, tenant.id);
      const access = entitlement(subscription);
      const downgrade = await suggestDowngrade(db, tenant.id);

      res.json({
        plans: selectablePlans().map(planPayload),
        subscription: subscription && {
          planKey: subscription.planKey,
          status: subscription.status,
          billingInterval: subscription.billingInterval,
          trialEndsAt: subscription.trialEndsAt,
          renewsAt: subscription.periodEnd,
          hasPaymentMethod: Boolean(subscription.stripeSubscriptionId),
          lastPaymentError: subscription.lastPaymentError,
        },
        usage: usage && {
          peopleThisPeriod: usage.peoplethisPeriod,
          peopleLimit: usage.peopleLimit,
          overLimit: usage.overLimit,
          needsCustomPlan: usage.needsCustomPlan,
          suggestedPlanKey: usage.suggestedPlan?.key ?? null,
          periodStart: usage.periodStart,
          periodEnd: usage.periodEnd,
        },
        access,
        // Deliberate lost revenue — see `suggestDowngrade`. A customer who
        // upgraded for one busy month should be told when they no longer need
        // the larger plan.
        suggestedDowngradeKey: downgrade?.key ?? null,
      });
    }
  );

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
        if (error instanceof SubscriptionError || error instanceof SignupError) {
          return res.status(400).json({ message: error.message });
        }
        // A billing client that is not configured refuses loudly rather than
        // pretending. That is a 503, not a 500 — nothing is broken, it is
        // simply switched off on this deployment.
        if ((error as Error).name === "BillingClientError") {
          return res.status(503).json({ message: (error as Error).message });
        }
        throw error;
      }
    };
  }

  router.post(
    "/t/:tenantSlug/admin/billing/checkout",
    requireAdmin,
    write(async (req, res) => {
      const tenant = req.engineTenant!;
      const body = req.body ?? {};
      const origin = originOf(req);

      const { url } = await startCheckout(db, {
        tenantId: tenant.id,
        planKey: String(body.planKey ?? ""),
        interval: (body.interval === "annual" ? "annual" : "monthly") as BillingInterval,
        successUrl: `${origin}/manage/${tenant.slug}?checkout=done`,
        cancelUrl: `${origin}/manage/${tenant.slug}?checkout=cancelled`,
        client: getBillingClient(),
      });

      res.json({ url });
    })
  );

  /**
   * Called when the browser comes back from Stripe.
   *
   * ⚠️ ARRIVING HERE IS NOT EVIDENCE OF PAYMENT — `completeCheckout` asks
   * Stripe and writes what Stripe says. This endpoint exists so the screen
   * updates promptly rather than waiting for a webhook; it is not the thing
   * that decides whether somebody paid.
   */
  router.post(
    "/t/:tenantSlug/admin/billing/refresh",
    requireAdmin,
    write(async (req, res) => {
      const tenant = req.engineTenant!;
      const subscription = await getSubscription(db, tenant.id);

      if (!subscription?.stripeSubscriptionId) {
        return void res.json({ status: subscription?.status ?? null });
      }

      const result = await completeCheckout(db, {
        tenantId: tenant.id,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        client: getBillingClient(),
      });

      res.json({ status: result?.status ?? subscription.status });
    })
  );

  /** Stripe's hosted portal — change card, change plan, cancel. */
  router.post(
    "/t/:tenantSlug/admin/billing/portal",
    requireAdmin,
    write(async (req, res) => {
      const tenant = req.engineTenant!;
      const subscription = await getSubscription(db, tenant.id);

      if (!subscription?.stripeCustomerId) {
        throw new SubscriptionError(
          "There is no billing account yet — choose a plan first."
        );
      }

      const { url } = await getBillingClient().createPortalSession({
        customerId: subscription.stripeCustomerId,
        returnUrl: `${originOf(req)}/manage/${tenant.slug}`,
      });

      res.json({ url });
    })
  );

  /**
   * Switch plan without going through Stripe.
   *
   * Only reachable while still trialing — once money is involved the change has
   * to happen on Stripe's side so the proration and the invoice are right, and
   * that is what the portal is for. Writing `planKey` locally on a paying
   * subscription would leave our record and Stripe's disagreeing about what
   * they are being charged for.
   */
  router.post(
    "/t/:tenantSlug/admin/billing/plan",
    requireAdmin,
    write(async (req, res, session) => {
      const tenant = req.engineTenant!;
      const body = req.body ?? {};
      const subscription = await getSubscription(db, tenant.id);

      if (subscription?.stripeSubscriptionId) {
        throw new SubscriptionError(
          "Change your plan through the billing portal so your invoice matches."
        );
      }

      await changePlan(db, tenant.id, String(body.planKey ?? ""), {
        actorId: session.tenantUserId,
        billingInterval: body.interval === "annual" ? "annual" : "monthly",
      });

      res.json({ ok: true });
    })
  );

  return router;
}

/**
 * Where to send the customer back to.
 *
 * Built from the configured public URL when there is one, and only otherwise
 * from the request. A `Host` header is client-controlled, so using it
 * unconditionally would let somebody craft a return link pointing at a site
 * they own.
 */
function originOf(req: Request): string {
  const configured = process.env.PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/+$/, "");

  const proto = req.protocol;
  const host = req.get("host") ?? "localhost:5000";
  return `${proto}://${host}`;
}

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  // Walks the cause chain: Drizzle wraps driver errors, so the SQLSTATE is on
  // `error.cause`. Checking `error.code` alone type-checks, looks right, and
  // silently never matches.
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    if (
      typeof current === "object" &&
      (current as { code?: string }).code === UNIQUE_VIOLATION
    ) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
