/**
 * Sending email, behind a seam.
 *
 * Same discipline as the cost resolver, the transfer executor and the billing
 * client: sandboxes cannot reach an email provider, so the templates and the
 * send-once logic are proven against a fixture before anything reaches a real
 * inbox. The default when nothing is configured REFUSES rather than pretending.
 *
 * ⚠️ THE RULE THAT OVERRIDES EVERYTHING ELSE HERE: a failure to send must never
 * fail the thing being reported. A payout that succeeded is a fact about money
 * that has moved; an email about it is a courtesy. Rolling back, retrying, or
 * throwing out of a payout because a mail server was briefly unreachable would
 * turn a cosmetic problem into a financial one. `notify.ts` is what enforces
 * that — this file just has to be honest about failing.
 */

import { createRequire } from "node:module";

import type {
  EmailMessageLike,
  EmailSendResult,
  EmailSender,
} from "./types";

export type { EmailSender } from "./types";

/** Plain text is always present — see `templates.ts` for why. */
export type EmailMessage = EmailMessageLike;
export type EmailResult = EmailSendResult;

/**
 * The default. Reports failure rather than throwing, because a caller that
 * cannot send email must still complete its real work.
 */
export class UnconfiguredEmailSender implements EmailSender {
  async send(): Promise<EmailResult> {
    return {
      ok: false,
      error: "Email is not configured on this deployment (set RESEND_API_KEY).",
    };
  }
}

/** In-memory, for tests and local work. */
export class FixtureEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  /** Set to make the next sends fail, so callers can be tested against it. */
  failNext = 0;

  async send(message: EmailMessage): Promise<EmailResult> {
    if (this.failNext > 0) {
      this.failNext--;
      return { ok: false, error: "Fixture failure" };
    }

    this.sent.push(message);
    // Derived from the message, not a counter — a per-instance counter mints
    // colliding ids across instances, which is a bug this repo has already had.
    return { ok: true, providerId: `msg_${message.to}_${this.sent.length}` };
  }

  lastTo(email: string): EmailMessage | undefined {
    return [...this.sent].reverse().find((m) => m.to === email);
  }
}

/**
 * Resend, which the marketplace already depends on.
 *
 * The SDK is injected so this class is testable, and loaded lazily so a
 * deployment without email configured never pulls it in.
 */
export interface ResendLike {
  emails: {
    send(params: Record<string, unknown>): Promise<{
      data?: { id?: string } | null;
      error?: { message?: string } | null;
    }>;
  };
}

export class ResendEmailSender implements EmailSender {
  private readonly client: ResendLike;
  private readonly from: string;

  constructor(options: { apiKey: string; from: string; client?: ResendLike }) {
    this.from = options.from;

    if (options.client) {
      this.client = options.client;
      return;
    }

    // ⚠️ `createRequire` is imported at the top, NOT pulled off a bare
    // `require`. This package is ESM (`"type": "module"`), so `require` is not
    // defined at runtime — the earlier version type-checked, passed every test
    // that injects a client, and threw `require is not defined` the first time
    // a real deployment tried to construct this. It was found by booting the
    // app, which is the only thing that constructs it for real.
    //
    // The `resend` package itself stays behind this lazy call so a deployment
    // with no email configured never loads it.
    const { Resend } = createRequire(import.meta.url)("resend");
    this.client = new Resend(options.apiKey) as ResendLike;
  }

  async send(message: EmailMessage): Promise<EmailResult> {
    try {
      const response = await this.client.emails.send({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        reply_to: message.replyTo,
      });

      if (response.error) {
        return { ok: false, error: response.error.message ?? "Send failed" };
      }

      return { ok: true, providerId: response.data?.id };
    } catch (error) {
      // Never rethrows. The caller is usually finishing something that already
      // succeeded; see the file header.
      return { ok: false, error: (error as Error).message };
    }
  }
}

let override: EmailSender | null = null;

/** Test seam — install a sender without touching the environment. */
export function setEmailSender(sender: EmailSender | null): void {
  override = sender;
}

let cached: EmailSender | null = null;

/**
 * ⚠️ NEVER THROWS, and that is a hard requirement rather than politeness.
 *
 * Callers do this AFTER work that has already committed — `admin-routes` builds
 * a sender to announce a payout whose money has already moved. A constructor
 * that throws there turns a completed payout into a 500 response, which is
 * precisely the failure the rest of this subsystem is built to prevent, arriving
 * through the one line nobody thought could fail. Constructing the provider
 * loads a package and can genuinely fail, so the failure is caught and turned
 * into a sender that reports it honestly.
 */
export function getEmailSender(): EmailSender {
  if (override) return override;
  if (cached) return cached;

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (apiKey && from) {
    try {
      cached = new ResendEmailSender({ apiKey, from });
    } catch (error) {
      cached = new BrokenEmailSender((error as Error).message);
    }
    return cached;
  }

  cached = new UnconfiguredEmailSender();
  return cached;
}

/**
 * The provider could not be constructed at all. Behaves exactly like
 * `UnconfiguredEmailSender` but carries the real reason, so the failure shows up
 * in `engine_email_log.error` instead of as a blank "not configured" that sends
 * somebody looking for a missing environment variable that is actually set.
 */
export class BrokenEmailSender implements EmailSender {
  constructor(private readonly reason: string) {}

  async send(): Promise<EmailResult> {
    return { ok: false, error: `Email provider failed to start: ${this.reason}` };
  }
}

export function resetEmailSender(): void {
  cached = null;
  override = null;
}

/**
 * Can this deployment actually deliver a message?
 *
 * ⚠️ EXISTS FOR THE DAILY JOB, and the reason is not cosmetic. `sendOnce`
 * claims its dedupe row before calling the provider and leaves it claimed when
 * the send fails, so sweeping every tenant through an unconfigured sender would
 * permanently burn the one-per-trial warning key for every customer currently
 * trialing. Adding a real key afterwards would not repair it: the system would
 * correctly believe those people had already been told.
 *
 * Request-path callers must NOT gate on this. They send as a courtesy after
 * work that has already committed, one message at a time, and recording the
 * failure is the honest outcome there. It is the unattended sweep across every
 * tenant at once that has to hold back.
 */
export function isEmailConfigured(): boolean {
  if (override) return true;
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}
