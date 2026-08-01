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

    const { createRequire } = require("node:module") as typeof import("node:module");
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

export function getEmailSender(): EmailSender {
  if (override) return override;
  if (cached) return cached;

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (apiKey && from) {
    cached = new ResendEmailSender({ apiKey, from });
    return cached;
  }

  cached = new UnconfiguredEmailSender();
  return cached;
}

export function resetEmailSender(): void {
  cached = null;
  override = null;
}
