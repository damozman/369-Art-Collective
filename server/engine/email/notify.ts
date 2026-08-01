/**
 * Sending a message exactly once, and never at the cost of the thing being
 * reported.
 *
 * ────────────────────────────────────────────────────────────────────────
 * THE TWO GUARANTEES
 * ────────────────────────────────────────────────────────────────────────
 *
 * 1. **At most once.** `dedupeKey` is unique per tenant, and the row is
 *    claimed BEFORE the provider is called. A replayed payout run, a retried
 *    job or two processes racing all collide on the index and only one send
 *    happens. Telling somebody twice that they have been paid reads as being
 *    paid twice — a support call about money, which is the expensive kind.
 *
 * 2. **Never throws.** Every function here returns a result. A payout that
 *    succeeded is a fact about money that has already moved; an email about it
 *    is a courtesy. Throwing out of a caller that has just completed a transfer
 *    would turn a mail-server hiccup into a financial incident — and worse, one
 *    where the money moved but the system recorded a failure.
 *
 * The claim-then-send order has one honest consequence worth naming: if the
 * process dies between claiming and sending, that message is never sent and the
 * row says `sent`. The alternative — send, then record — risks sending twice on
 * the same crash. Given the choice between a missed notification and a customer
 * believing they were paid twice, this takes the missed notification. A failed
 * send is recorded as `failed` and can be re-driven; a lost one shows up as a
 * row nobody can explain, which is why the trade is documented rather than
 * hidden.
 */

import { and, eq } from "drizzle-orm";

import * as schema from "@shared/engine-schema";
import type { EngineDb } from "../ingest";
import type { EmailSender, RenderedEmailLike } from "./types";

export interface NotifyResult {
  status: "sent" | "failed" | "duplicate" | "no_recipient";
  error?: string;
}

const UNIQUE_VIOLATION = "23505";

/** Walks the cause chain — Drizzle wraps driver errors, so the SQLSTATE is on
 *  `error.cause`. Checking `error.code` alone type-checks and never matches. */
function isUniqueViolation(error: unknown): boolean {
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

export async function sendOnce(
  db: EngineDb,
  options: {
    tenantId: string;
    type: string;
    dedupeKey: string;
    to: string | null | undefined;
    email: RenderedEmailLike;
    sender: EmailSender;
    replyTo?: string;
  }
): Promise<NotifyResult> {
  // Somebody with no email address is a normal state, not an error — a
  // contributor can be paid without ever signing in.
  if (!options.to || options.to.trim().length === 0) {
    return { status: "no_recipient" };
  }

  let logId: string;

  try {
    const [row] = await db
      .insert(schema.emailLog)
      .values({
        tenantId: options.tenantId,
        type: options.type,
        dedupeKey: options.dedupeKey,
        toEmail: options.to,
        subject: options.email.subject,
        status: "sent",
      })
      .returning({ id: schema.emailLog.id });

    logId = row.id;
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Already sent, or being sent right now by someone else. Either way this
      // caller must not send it again.
      return { status: "duplicate" };
    }
    // A database problem is the caller's problem to ignore, not to crash on.
    return { status: "failed", error: (error as Error).message };
  }

  const result = await options.sender.send({
    to: options.to,
    subject: options.email.subject,
    text: options.email.text,
    html: options.email.html,
    replyTo: options.replyTo,
  });

  if (!result.ok) {
    // Recorded, never thrown. The row stays so the dedupe key is still claimed;
    // re-driving a failed send is a deliberate action, not an accident.
    await db
      .update(schema.emailLog)
      .set({ status: "failed", error: result.error ?? "Unknown error" })
      .where(eq(schema.emailLog.id, logId))
      .catch(() => {
        /* nothing useful to do — see guarantee 2 */
      });

    return { status: "failed", error: result.error };
  }

  await db
    .update(schema.emailLog)
    .set({ providerId: result.providerId ?? null })
    .where(eq(schema.emailLog.id, logId))
    .catch(() => {
      /* the send happened; losing the provider id is cosmetic */
    });

  return { status: "sent" };
}

/** Has this exact message already been dealt with? */
export async function alreadySent(
  db: EngineDb,
  tenantId: string,
  dedupeKey: string
): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.emailLog.id })
    .from(schema.emailLog)
    .where(
      and(
        eq(schema.emailLog.tenantId, tenantId),
        eq(schema.emailLog.dedupeKey, dedupeKey)
      )
    )
    .limit(1);

  return Boolean(row);
}
