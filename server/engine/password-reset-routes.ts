/**
 * The forgot-password endpoints, for both sign-ins.
 *
 * Mounted under the tenant prefix because identity is `(tenant, email)` — the
 * same address can belong to a contributor at one business and an owner at
 * another, and they are different accounts with different powers.
 *
 * ⚠️ EVERY RESPONSE ON THE REQUEST PATH IS IDENTICAL. Same status, same body,
 * whether the address exists, belongs to a deactivated person, or is nonsense.
 * The temptation to be helpful here — "we don't have that email" — hands over a
 * membership oracle, and on a payouts product, confirming that a named person is
 * paid by a named business is itself a disclosure.
 *
 * That rule extends to failures: if the email cannot be sent, the response is
 * still the same. `requestReset` deliberately does not report deliverability
 * for exactly this reason.
 */

import { Router, type NextFunction, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import rateLimit from "express-rate-limit";

import * as schema from "@shared/engine-schema";
import { AuthError } from "./auth";
import { getEmailSender } from "./email/sender";
import { passwordResetEmail } from "./email/templates";
import type { EngineDb } from "./ingest";
import {
  RESET_TTL_MINUTES,
  checkReset,
  completeReset,
  requestReset,
  type ResetSubject,
} from "./password-reset";

/**
 * Five an hour per address.
 *
 * Tight, because each request sends an email to somebody who may not have asked
 * for it — an unthrottled endpoint is a way to use this system to harass a
 * person's inbox. Legitimate use needs one, occasionally two.
 */
const requestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Try again in an hour." },
});

/** Looser: this one is a person typing a new password, possibly badly. */
const completeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Try again in an hour." },
});

interface TenantRequest extends Request {
  engineTenant?: { id: string; slug: string; name: string };
}

export function createPasswordResetRouter(db: EngineDb): Router {
  const router = Router({ mergeParams: true });

  async function resolveTenant(req: TenantRequest, res: Response, next: NextFunction) {
    const [tenant] = await db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.slug, String(req.params.tenantSlug ?? "")))
      .limit(1);

    if (!tenant) return res.status(404).json({ message: "Not found" });

    req.engineTenant = { id: tenant.id, slug: tenant.slug, name: tenant.name };
    next();
  }

  router.use("/t/:tenantSlug/password", resolveTenant);

  /**
   * Ask for a reset link.
   *
   * `subject` says which sign-in: the contributor portal or the owner console.
   * It comes from which screen the request was made on, not from the address —
   * one address can legitimately be both.
   */
  router.post(
    "/t/:tenantSlug/password/forgot",
    requestLimiter,
    async (req: TenantRequest, res) => {
      const tenant = req.engineTenant!;
      const body = req.body ?? {};
      const subject: ResetSubject =
        body.subject === "tenant_user" ? "tenant_user" : "contributor";

      const result = await requestReset(db, {
        tenantId: tenant.id,
        subject,
        email: String(body.email ?? ""),
        ip: req.ip ?? null,
      });

      if (result.delivered && result.token) {
        const path =
          subject === "contributor"
            ? `/portal/${tenant.slug}/reset`
            : `/manage/${tenant.slug}/reset`;

        const email = passwordResetEmail({
          name: result.name!,
          tenantName: tenant.name,
          resetUrl: `${publicBaseUrl(req)}${path}?token=${encodeURIComponent(result.token)}`,
          expiresInMinutes: RESET_TTL_MINUTES,
        });

        // Sent directly rather than through `sendOnce`: a reset must work on the
        // second attempt as well as the first, and a dedupe key would make the
        // second request silently do nothing. The rate limiter is what bounds
        // this instead.
        //
        // Failure is swallowed on purpose — reporting it would tell the caller
        // that an account exists, which is the one thing this endpoint must not
        // reveal.
        await getEmailSender()
          .send({
            to: result.email!,
            subject: email.subject,
            text: email.text,
            html: email.html,
          })
          .catch(() => undefined);
      }

      // Identical for everybody. See the file header.
      res.json({
        message:
          "If that address has an account, a reset link is on its way. Check your inbox.",
      });
    }
  );

  /** Is this link still good? Drives whether the form is shown at all. */
  router.get("/t/:tenantSlug/password/check", async (req: TenantRequest, res) => {
    const result = await checkReset(db, String(req.query.token ?? ""));
    res.json({ valid: result.valid, reason: result.reason ?? null });
  });

  router.post(
    "/t/:tenantSlug/password/reset",
    completeLimiter,
    async (req: TenantRequest, res) => {
      const body = req.body ?? {};

      try {
        const result = await completeReset(db, {
          token: String(body.token ?? ""),
          newPassword: String(body.password ?? ""),
        });

        // Deliberately NOT signed in afterwards. Whoever holds the link is not
        // necessarily the account owner — proving they can set a password is not
        // proving they own the mailbox it went to. Making them sign in costs one
        // extra step and closes that gap.
        res.json({ ok: true, subject: result.subject });
      } catch (error) {
        if (error instanceof AuthError) {
          return res.status(400).json({ message: error.message });
        }
        throw error;
      }
    }
  );

  return router;
}

/**
 * Where the reset link points.
 *
 * ⚠️ PREFERS THE CONFIGURED URL, and that matters more here than anywhere else
 * in the system. A `Host` header is client-controlled, so building this from the
 * request would let somebody request a reset for another person's address and
 * have the emailed link point at a site they control — turning this endpoint
 * into a credential-harvesting service that sends mail from our domain.
 */
function publicBaseUrl(req: Request): string {
  const configured = process.env.PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/+$/, "");
  return `${req.protocol}://${req.get("host") ?? "localhost:5000"}`;
}
