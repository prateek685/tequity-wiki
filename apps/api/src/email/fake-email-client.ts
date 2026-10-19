import { type EmailClient, emailDomain, type EmailMessage } from "./email-client.js";

export interface EmailLogger {
  info(fields: Record<string, unknown>, message: string): void;
}

/**
 * Stand-in for Resend (development without RESEND_API_KEY, and all tests): sends nothing, logs
 * "email queued" with the recipient's domain and the template names only (never the address or body),
 * and keeps the messages in `outbox` for tests.
 */
export class FakeEmailClient implements EmailClient {
  readonly name = "fake";
  readonly outbox: EmailMessage[] = [];

  constructor(private readonly logger?: EmailLogger) {}

  send(message: EmailMessage): Promise<void> {
    this.outbox.push(message);
    this.logger?.info(
      { to: emailDomain(message.to), templates: [...new Set(message.templates)] },
      "email queued",
    );
    return Promise.resolve();
  }
}
