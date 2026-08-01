/**
 * A business creating its own account.
 *
 * Self-serve, chosen by the user on 2026-08-01 over approving each signup by
 * hand. The reasoning is worth keeping, because the obvious instinct is to gate
 * it:
 *
 *   Approval would NOT be a fraud control here. Tenants connect their own
 *   Stripe and we never hold anyone's money (ratified decision #1), so Stripe
 *   does the identity checking and we are not the thing standing between a bad
 *   actor and someone's funds. Gating buys conversations, not safety — and the
 *   conversations are available anyway by being notified when someone signs up.
 *
 * `REQUIRE_SIGNUP_APPROVAL` exists so that judgement can be reversed in one
 * environment variable if the wrong people start arriving. It is off.
 *
 * ────────────────────────────────────────────────────────────────────────
 * WHAT THIS CREATES, AND WHY IT IS ONE TRANSACTION
 * ────────────────────────────────────────────────────────────────────────
 *
 * A tenant, its first admin user, and a trial subscription. All three or none:
 * a tenant with no user is unreachable and invisible, and a tenant with a user
 * but no subscription looks to `entitlement()` like an account that has been
 * cut off. Both states need a human to repair, and neither can be repaired by
 * the person who just signed up.
 */

import { eq } from "drizzle-orm";

import * as schema from "@shared/engine-schema";
import { hashPassword } from "../auth";
import type { EngineDb } from "../ingest";
import { addDays } from "./subscription";
import { DEFAULT_PLAN_KEY, TRIAL_DAYS, findPlan } from "./plans";

export class SignupError extends Error {}

/** Off by default — see the header. */
export function requiresApproval(): boolean {
  return process.env.REQUIRE_SIGNUP_APPROVAL === "true";
}

export interface SignupInput {
  /** The business name, as they would write it on an invoice. */
  businessName: string;
  /** Their preferred URL fragment. Derived from the name when absent. */
  slug?: string;
  name: string;
  email: string;
  password: string;
  planKey?: string;
}

/**
 * Reserved because they collide with real routes, or because owning them lets
 * somebody impersonate us. `/portal/admin` reading as an official page is
 * exactly the sort of thing that gets used against a contributor.
 */
const RESERVED_SLUGS = new Set([
  "admin", "api", "app", "manage", "portal", "billing", "signup", "login",
  "logout", "settings", "support", "help", "status", "static", "assets",
  "www", "mail", "internal", "system", "engine", "new", "account",
]);

export function toSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    // Strip accents rather than dropping the letters, so "Café Noir" becomes
    // "cafe-noir" instead of "caf-noir".
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function validateSignup(input: SignupInput): void {
  if (!input.businessName || input.businessName.trim().length < 2) {
    throw new SignupError("Tell us your business name");
  }
  if (!input.name || input.name.trim().length < 2) {
    throw new SignupError("Tell us your name");
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email ?? "")) {
    throw new SignupError("That email address does not look right");
  }
  // Length over composition rules: a 12-character passphrase beats a
  // symbol-mangled 8, and composition rules mostly produce "Password1!".
  if (!input.password || input.password.length < 12) {
    throw new SignupError("Use a password of at least 12 characters");
  }
  if (input.planKey && !findPlan(input.planKey)) {
    throw new SignupError("That plan does not exist");
  }

  const slug = input.slug ? toSlug(input.slug) : toSlug(input.businessName);
  if (slug.length < 2) {
    throw new SignupError(
      "We could not make a web address from that name — please choose one"
    );
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new SignupError("That web address is not available — please choose another");
  }
}

export interface SignupResult {
  tenantId: string;
  tenantSlug: string;
  tenantUserId: string;
  trialEndsAt: Date;
  /** True when approval is required, meaning they cannot sign in yet. */
  pendingApproval: boolean;
}

export async function signUp(
  db: EngineDb,
  input: SignupInput,
  options: { now?: Date } = {}
): Promise<SignupResult> {
  validateSignup(input);

  const now = options.now ?? new Date();
  const email = input.email.toLowerCase().trim();
  const planKey = input.planKey ?? DEFAULT_PLAN_KEY;
  const baseSlug = input.slug ? toSlug(input.slug) : toSlug(input.businessName);

  const slug = await findFreeSlug(db, baseSlug);
  const passwordHash = await hashPassword(input.password);
  const trialEndsAt = addDays(now, TRIAL_DAYS);

  return db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(schema.tenants)
      .values({
        name: input.businessName.trim(),
        slug,
        defaultCurrency: "USD",
      })
      .returning({ id: schema.tenants.id, slug: schema.tenants.slug });

    const [user] = await tx
      .insert(schema.tenantUsers)
      .values({
        tenantId: tenant.id,
        email,
        name: input.name.trim(),
        passwordHash,
        role: "admin",
      })
      .returning({ id: schema.tenantUsers.id });

    await tx.insert(schema.subscriptions).values({
      tenantId: tenant.id,
      planKey,
      status: "trialing",
      periodStart: now,
      periodEnd: trialEndsAt,
      trialEndsAt,
    });

    await tx.insert(schema.auditLog).values({
      tenantId: tenant.id,
      actorType: "tenant_user",
      actorId: user.id,
      action: "signup",
      entityType: "tenant",
      entityId: tenant.id,
      after: { businessName: input.businessName.trim(), slug, planKey },
    });

    return {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantUserId: user.id,
      trialEndsAt,
      pendingApproval: requiresApproval(),
    };
  });
}

/**
 * Find a web address nobody is using.
 *
 * Appends -2, -3 … rather than rejecting, because "that name is taken" is a
 * pointless obstacle for someone who has already decided to sign up, and two
 * businesses can legitimately share a name.
 *
 * There is a race here: two simultaneous signups can pick the same suffix, and
 * the loser hits the unique index on `slug`. That is handled by the caller
 * showing the error rather than by locking, because the window is milliseconds
 * wide and a lock on tenant creation is a worse trade.
 */
async function findFreeSlug(db: EngineDb, base: string): Promise<string> {
  for (let suffix = 1; suffix <= 50; suffix++) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`;
    if (RESERVED_SLUGS.has(candidate)) continue;

    const [taken] = await db
      .select({ id: schema.tenants.id })
      .from(schema.tenants)
      .where(eq(schema.tenants.slug, candidate))
      .limit(1);

    if (!taken) return candidate;
  }

  throw new SignupError(
    "That business name is heavily used — please choose a web address yourself"
  );
}
