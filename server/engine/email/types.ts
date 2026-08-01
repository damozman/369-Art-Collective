/**
 * Shared shapes, in their own file so `notify.ts` does not import the Resend
 * SDK transitively just to describe a message.
 */

export interface RenderedEmailLike {
  subject: string;
  text: string;
  html?: string;
}

export interface EmailMessageLike {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export interface EmailSendResult {
  ok: boolean;
  providerId?: string;
  error?: string;
}

export interface EmailSender {
  send(message: EmailMessageLike): Promise<EmailSendResult>;
}
