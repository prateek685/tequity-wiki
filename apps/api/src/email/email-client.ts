/**
 * The one door to email (docs/PORTAL_PLAN.md §3 "Emails", §8): used by the worker only, for the two
 * manager emails (a check-in coming due, a new red flag). Implementations: Resend (when RESEND_API_KEY and
 * EMAIL_FROM are set) and a fake that only logs (development without a key, and all tests).
 */
export interface EmailClient {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

/** Injection token: `EmailClient`, or null when none is configured (production without a key). */
export const EMAIL_CLIENT = Symbol("EMAIL_CLIENT");

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain text, shown where HTML isn't. Never logged. */
  text: string;
  /** The HTML version. Never logged. */
  html: string;
  /** The templates of the items in this email (for logs). */
  templates: readonly string[];
  /** The same items always give the same key, so a retried send isn't delivered twice. */
  idempotencyKey: string;
}

/** The part of an address after "@" (what logs may show of a recipient). */
export function emailDomain(address: string): string {
  return address.slice(address.lastIndexOf("@") + 1).toLowerCase();
}
