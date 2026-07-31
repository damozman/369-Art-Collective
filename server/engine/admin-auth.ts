/**
 * Tenant-user authentication — the admin side.
 *
 * A THIRD identity system, deliberately separate from both the marketplace's
 * `user` session and the engine's `engineContributor` session.
 *
 * Why three rather than one: a contributor can see only their own earnings; a
 * tenant admin can see everyone's in their tenant and can move money. Those are
 * different powers over different tables, and collapsing them into a shared
 * session shape is how an artist login ends up able to trigger a payout run.
 * Each has its own session key, its own table, and its own guard.
 *
 * Identity is `(tenantId, email)`, same as contributors and for the same reason:
 * one person may legitimately administer more than one tenant.
 */

import bcrypt from "bcryptjs";
import { and, eq, isNull } from "drizzle-orm";

import * as schema from "@shared/engine-schema";
import { AuthError, hashPassword } from "./auth";
import type { EngineDb } from "./ingest";

export type TenantUserRole = "admin" | "viewer";

export interface AdminSession {
  tenantUserId: string;
  tenantId: string;
  tenantSlug: string;
  name: string;
  email: string;
  role: TenantUserRole;
}

/**
 * Create a tenant user. Used by seeding and, later, by tenant onboarding.
 *
 * Returns the id rather than the row so a caller cannot accidentally log or
 * serialise the password hash.
 */
export async function createTenantUser(
  db: EngineDb,
  options: {
    tenantId: string;
    email: string;
    name: string;
    password: string;
    role?: TenantUserRole;
  }
): Promise<string> {
  const passwordHash = await hashPassword(options.password);

  const [row] = await db
    .insert(schema.tenantUsers)
    .values({
      tenantId: options.tenantId,
      email: options.email.toLowerCase().trim(),
      name: options.name,
      passwordHash,
      role: options.role ?? "admin",
    })
    .returning({ id: schema.tenantUsers.id });

  return row.id;
}

/**
 * Authenticate a tenant user.
 *
 * Same discipline as contributor login: one message for every failure, and the
 * bcrypt cost paid even when no user matched, so neither the response nor its
 * timing reveals who administers a tenant.
 */
export async function authenticateTenantUser(
  db: EngineDb,
  tenantId: string,
  tenantSlug: string,
  email: string,
  password: string
): Promise<AdminSession | null> {
  const [user] = await db
    .select()
    .from(schema.tenantUsers)
    .where(
      and(
        eq(schema.tenantUsers.tenantId, tenantId),
        eq(schema.tenantUsers.email, email.toLowerCase().trim()),
        isNull(schema.tenantUsers.deletedAt)
      )
    )
    .limit(1);

  const hashToCompare =
    user?.passwordHash ??
    "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

  const matches = await bcrypt.compare(password, hashToCompare);

  if (!user || !matches) return null;

  await db
    .update(schema.tenantUsers)
    .set({ lastLoginAt: new Date() })
    .where(eq(schema.tenantUsers.id, user.id));

  return {
    tenantUserId: user.id,
    tenantId: user.tenantId,
    tenantSlug,
    name: user.name,
    email: user.email,
    role: user.role as TenantUserRole,
  };
}

/** Re-load on every request, so a removed admin loses access immediately. */
export async function loadAdminSession(
  db: EngineDb,
  tenantId: string,
  tenantSlug: string,
  tenantUserId: string
): Promise<AdminSession | null> {
  const [user] = await db
    .select()
    .from(schema.tenantUsers)
    .where(
      and(
        eq(schema.tenantUsers.id, tenantUserId),
        eq(schema.tenantUsers.tenantId, tenantId),
        isNull(schema.tenantUsers.deletedAt)
      )
    )
    .limit(1);

  if (!user) return null;

  return {
    tenantUserId: user.id,
    tenantId: user.tenantId,
    tenantSlug,
    name: user.name,
    email: user.email,
    role: user.role as TenantUserRole,
  };
}

/**
 * Guard for anything that moves money or changes rules.
 *
 * `viewer` exists so a bookkeeper or accountant can be given read access to
 * statements and balances without the ability to trigger a payout run. Every
 * write endpoint calls this; read endpoints do not.
 */
export function assertCanWrite(session: AdminSession): void {
  if (session.role !== "admin") {
    throw new AuthError("This account has read-only access");
  }
}
