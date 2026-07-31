/**
 * Contributor authentication (ratified decision #2).
 *
 * Contributors get a login in Phase 1 because self-serve earnings visibility is
 * the core trust differentiator — a contributor who can see *why* they were paid
 * an amount does not email the tenant to ask, and that is most of the value.
 *
 * THE PART THAT IS EASY TO GET WRONG: identity here is
 * `(tenantId, email)`, never `email` alone.
 *
 * Two different tenants can legitimately have a contributor with the same email
 * address — the same freelance illustrator may work for three of them. If login
 * looked up by email alone it would either collide or, far worse, authenticate
 * someone into the wrong tenant's earnings. Every function in this file takes a
 * tenant, and the unique index in the schema is on the pair.
 *
 * Password storage is bcrypt, matching the marketplace so there is one hashing
 * story in the repo rather than two.
 */

import bcrypt from "bcryptjs";
import { and, eq, isNull } from "drizzle-orm";

import * as schema from "@shared/engine-schema";
import type { EngineDb } from "./ingest";

/** Cost factor. 10 matches the marketplace; raise together, never separately. */
const BCRYPT_ROUNDS = 10;

/** Minimum viable password policy. Deliberately not clever. */
export const MIN_PASSWORD_LENGTH = 8;

export class AuthError extends Error {}

export interface ContributorSession {
  contributorId: string;
  tenantId: string;
  name: string;
  email: string;
}

export function validatePassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
    );
  }
}

export async function hashPassword(password: string): Promise<string> {
  validatePassword(password);
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Set or replace a contributor's password.
 *
 * Scoped by tenant so a caller holding only an id from another tenant's context
 * cannot reset the wrong person's credentials.
 */
export async function setContributorPassword(
  db: EngineDb,
  tenantId: string,
  contributorId: string,
  password: string
): Promise<void> {
  const passwordHash = await hashPassword(password);

  const updated = await db
    .update(schema.contributors)
    .set({ passwordHash })
    .where(
      and(
        eq(schema.contributors.id, contributorId),
        eq(schema.contributors.tenantId, tenantId)
      )
    )
    .returning({ id: schema.contributors.id });

  if (updated.length === 0) {
    throw new AuthError("Contributor not found in this tenant");
  }
}

/**
 * Authenticate a contributor within a tenant.
 *
 * Returns null for every failure mode rather than distinguishing them. Telling a
 * caller "no such email" versus "wrong password" hands an attacker a way to
 * enumerate who works for a tenant, which for a payouts product is commercially
 * sensitive on its own.
 *
 * The bcrypt comparison runs even when no contributor matched, so the response
 * time does not reveal whether the account exists.
 */
export async function authenticateContributor(
  db: EngineDb,
  tenantId: string,
  email: string,
  password: string
): Promise<ContributorSession | null> {
  const [contributor] = await db
    .select()
    .from(schema.contributors)
    .where(
      and(
        eq(schema.contributors.tenantId, tenantId),
        eq(schema.contributors.email, email.toLowerCase().trim()),
        isNull(schema.contributors.deletedAt)
      )
    )
    .limit(1);

  // A dummy hash of the right shape, so the comparison cost is paid either way.
  const hashToCompare =
    contributor?.passwordHash ??
    "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

  const matches = await bcrypt.compare(password, hashToCompare);

  if (!contributor || !contributor.passwordHash || !matches) {
    return null;
  }

  if (!contributor.active) {
    return null;
  }

  await db
    .update(schema.contributors)
    .set({ lastLoginAt: new Date() })
    .where(eq(schema.contributors.id, contributor.id));

  return {
    contributorId: contributor.id,
    tenantId: contributor.tenantId,
    name: contributor.name,
    email: contributor.email ?? "",
  };
}

/**
 * Load a contributor for a session, re-checking they still belong to the tenant.
 *
 * Called on every authenticated request rather than trusting the session blob.
 * A contributor deactivated or deleted mid-session should stop having access to
 * earnings data immediately, not at the next login.
 */
export async function loadSessionContributor(
  db: EngineDb,
  tenantId: string,
  contributorId: string
): Promise<ContributorSession | null> {
  const [contributor] = await db
    .select()
    .from(schema.contributors)
    .where(
      and(
        eq(schema.contributors.id, contributorId),
        eq(schema.contributors.tenantId, tenantId),
        isNull(schema.contributors.deletedAt)
      )
    )
    .limit(1);

  if (!contributor || !contributor.active) return null;

  return {
    contributorId: contributor.id,
    tenantId: contributor.tenantId,
    name: contributor.name,
    email: contributor.email ?? "",
  };
}

/**
 * Guard for reading another party's data.
 *
 * A contributor may only ever read their own earnings, and only within their own
 * tenant. This is a single call rather than an inline `if` at each route so the
 * check cannot be forgotten on a new endpoint — which is exactly how these leaks
 * happen.
 */
export function assertCanReadContributor(
  session: ContributorSession,
  tenantId: string,
  contributorId: string
): void {
  if (session.tenantId !== tenantId) {
    throw new AuthError("Cross-tenant access denied");
  }
  if (session.contributorId !== contributorId) {
    throw new AuthError("A contributor may only read their own earnings");
  }
}
