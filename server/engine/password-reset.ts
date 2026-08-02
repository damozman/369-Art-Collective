/**
 * Resetting a forgotten password, for both sign-ins.
 *
 * Serves the contributor portal and the owner console. They are separate tables
 * and separate sessions (see `admin-auth.ts`), so `subject` says which one a
 * reset belongs to and every lookup is scoped by tenant — identity here is
 * `(tenant, email)`, never email alone.
 *
 * ────────────────────────────────────────────────────────────────────────
 * FIVE RULES, EACH ONE A KNOWN WAY THIS FEATURE GOES WRONG
 * ────────────────────────────────────────────────────────────────────────
 *
 * 1. **The token is stored hashed.** It exists in readable form only in the
 *    email and the link. A database backup must not be a set of live
 *    account-takeover links.
 *
 * 2. **Requesting a reset never reveals whether an account exists.** Same
 *    response, same timing, whether or not the address is known. A form that
 *    says "no account with that email" is a free membership oracle — and on a
 *    payouts product, confirming that someone is paid by a given business is
 *    itself worth something.
 *
 * 3. **One use, then dead.** `usedAt` is set inside the same transaction that
 *    changes the password, so a link forwarded, logged by a mail scanner, or
 *    sitting in a browser history cannot be replayed.
 *
 * 4. **Short-lived.** An hour. Long enough to walk away from the computer,
 *    short enough that a leaked mailbox is not a permanent back door.
 *
 * 5. **Using a reset invalidates every other outstanding one for that person.**
 *    Otherwise a stale link from three requests ago still works, which quietly
 *    widens the window rule 4 exists to close.
 *
 * ⚠️ AND ONE THING THIS DELIBERATELY DOES NOT DO: it does not tell the caller
 * whether the email was actually sent. `requestReset` returns the same shape
 * regardless, so a route cannot accidentally leak rule 2 by reporting a send
 * failure only for addresses that exist.
 */

import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, lt } from "drizzle-orm";

import * as schema from "@shared/engine-schema";
import { AuthError, hashPassword, validatePassword } from "./auth";
import type { EngineDb } from "./ingest";

/** An hour. See rule 4. */
export const RESET_TTL_MINUTES = 60;

export type ResetSubject = "contributor" | "tenant_user";

/**
 * 32 bytes from the CSPRNG, base64url.
 *
 * Not a uuid: uuidv4 carries 122 bits and is designed for uniqueness rather
 * than unguessability, and several implementations are not cryptographically
 * random. This is the credential that replaces a password, so it gets the
 * same treatment a session id would.
 */
export function mintToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 is right here, not bcrypt: the input is already 256 bits of entropy,
 *  so there is nothing to slow down a guesser about — and reset lookups happen
 *  on a click, where a deliberate 100ms cost buys nothing. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface ResetRequest {
  /** Always present, even when no account matched — see rule 2. */
  delivered: boolean;
  /** Only set when an account matched AND a caller needs to send the email. */
  token?: string;
  subjectId?: string;
  name?: string;
  email?: string;
}

/**
 * Begin a reset.
 *
 * Returns a token ONLY when an account matched. The caller sends the email; if
 * nothing matched it simply has nothing to send, and must not behave
 * differently — no early return, no distinct status code, no faster response.
 */
export async function requestReset(
  db: EngineDb,
  options: {
    tenantId: string;
    subject: ResetSubject;
    email: string;
    ip?: string | null;
    now?: Date;
  }
): Promise<ResetRequest> {
  const now = options.now ?? new Date();
  const email = options.email.toLowerCase().trim();

  const found =
    options.subject === "contributor"
      ? await findContributor(db, options.tenantId, email)
      : await findTenantUser(db, options.tenantId, email);

  if (!found) return { delivered: false };

  const token = mintToken();

  await db.insert(schema.passwordResets).values({
    tenantId: options.tenantId,
    subject: options.subject,
    subjectId: found.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + RESET_TTL_MINUTES * 60 * 1000),
    requestedIp: options.ip ?? null,
  });

  return {
    delivered: true,
    token,
    subjectId: found.id,
    name: found.name,
    email: found.email,
  };
}

export interface ResetCheck {
  valid: boolean;
  /** Why not, in language safe to show. Never says whose token it was. */
  reason?: string;
  subject?: ResetSubject;
  subjectId?: string;
  tenantId?: string;
}

/**
 * Is this link still good?
 *
 * Used to decide whether to show the form at all. Deliberately says *why* a
 * link failed — expired, already used — because those are facts about the
 * link the holder already has, not about who owns it, and "invalid" alone
 * sends people into a loop of re-requesting.
 */
export async function checkReset(
  db: EngineDb,
  token: string,
  now = new Date()
): Promise<ResetCheck> {
  const [row] = await db
    .select()
    .from(schema.passwordResets)
    .where(eq(schema.passwordResets.tokenHash, hashToken(token)))
    .limit(1);

  if (!row) return { valid: false, reason: "This link is not valid." };

  if (row.usedAt) {
    return { valid: false, reason: "This link has already been used." };
  }

  if (row.expiresAt <= now) {
    return { valid: false, reason: "This link has expired." };
  }

  return {
    valid: true,
    subject: row.subject as ResetSubject,
    subjectId: row.subjectId,
    tenantId: row.tenantId,
  };
}

/**
 * Complete the reset.
 *
 * One transaction: set the password, burn this token, and burn every other
 * outstanding token for the same person. Splitting these leaves a window where
 * the password has changed and an old link still works.
 */
export async function completeReset(
  db: EngineDb,
  options: { token: string; newPassword: string; now?: Date }
): Promise<{ subject: ResetSubject; subjectId: string; tenantId: string }> {
  const now = options.now ?? new Date();

  // Validate the password BEFORE burning anything. A rejected password must
  // leave the link usable, or a typo costs the person another email.
  validatePassword(options.newPassword);

  const check = await checkReset(db, options.token, now);
  if (!check.valid) throw new AuthError(check.reason ?? "This link is not valid.");

  const passwordHash = await hashPassword(options.newPassword);

  await db.transaction(async (tx) => {
    if (check.subject === "contributor") {
      await tx
        .update(schema.contributors)
        .set({ passwordHash })
        .where(
          and(
            eq(schema.contributors.id, check.subjectId!),
            eq(schema.contributors.tenantId, check.tenantId!)
          )
        );
    } else {
      await tx
        .update(schema.tenantUsers)
        .set({ passwordHash })
        .where(
          and(
            eq(schema.tenantUsers.id, check.subjectId!),
            eq(schema.tenantUsers.tenantId, check.tenantId!)
          )
        );
    }

    // Rule 5: every outstanding link for this person dies, not just this one.
    await tx
      .update(schema.passwordResets)
      .set({ usedAt: now })
      .where(
        and(
          eq(schema.passwordResets.subject, check.subject!),
          eq(schema.passwordResets.subjectId, check.subjectId!),
          isNull(schema.passwordResets.usedAt)
        )
      );

    await tx.insert(schema.auditLog).values({
      tenantId: check.tenantId!,
      actorType: check.subject === "contributor" ? "contributor" : "tenant_user",
      actorId: check.subjectId!,
      action: "password_reset",
      entityType: check.subject!,
      entityId: check.subjectId!,
      // No token, no hash, nothing replayable. Only that it happened.
      after: { via: "reset_link" },
    });
  });

  return {
    subject: check.subject!,
    subjectId: check.subjectId!,
    tenantId: check.tenantId!,
  };
}

/**
 * Housekeeping: drop rows nobody can use any more.
 *
 * Not security-critical — an expired token is already refused — but a table
 * that only grows is a table somebody eventually has to explain.
 */
export async function purgeExpiredResets(
  db: EngineDb,
  olderThan: Date
): Promise<number> {
  // Expiry alone is enough: a used row's `expiresAt` is in the past too, so
  // this catches both without a second clause.
  const removed = await db
    .delete(schema.passwordResets)
    .where(lt(schema.passwordResets.expiresAt, olderThan))
    .returning({ id: schema.passwordResets.id });

  return removed.length;
}

async function findContributor(
  db: EngineDb,
  tenantId: string,
  email: string
): Promise<{ id: string; name: string; email: string } | null> {
  const [row] = await db
    .select({
      id: schema.contributors.id,
      name: schema.contributors.name,
      email: schema.contributors.email,
      active: schema.contributors.active,
    })
    .from(schema.contributors)
    .where(
      and(
        eq(schema.contributors.tenantId, tenantId),
        eq(schema.contributors.email, email)
      )
    )
    .limit(1);

  // An inactive contributor is not offered a reset, but the caller cannot tell
  // that apart from "no such address" — see rule 2.
  if (!row?.email || !row.active) return null;
  return { id: row.id, name: row.name, email: row.email };
}

async function findTenantUser(
  db: EngineDb,
  tenantId: string,
  email: string
): Promise<{ id: string; name: string; email: string } | null> {
  const [row] = await db
    .select({
      id: schema.tenantUsers.id,
      name: schema.tenantUsers.name,
      email: schema.tenantUsers.email,
      deletedAt: schema.tenantUsers.deletedAt,
    })
    .from(schema.tenantUsers)
    .where(
      and(
        eq(schema.tenantUsers.tenantId, tenantId),
        eq(schema.tenantUsers.email, email)
      )
    )
    .limit(1);

  if (!row || row.deletedAt) return null;
  return { id: row.id, name: row.name, email: row.email };
}

/**
 * Constant-time comparison, exported for anywhere a token is compared directly
 * rather than looked up by hash.
 *
 * Not used by the lookup path above — an indexed hash lookup already leaks
 * nothing useful about timing — but present so nobody reaches for `===` if a
 * direct comparison is ever needed.
 */
export function safeTokenEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
