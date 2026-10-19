import { type EmailClient, type EmailMessage } from "./email-client.js";

const RESEND_URL = "https://api.resend.com/emails";
/** A send that takes longer than this fails (and BullMQ retries it). */
const TIMEOUT_MS = 15_000;

/**
 * Email through Resend's HTTP API (no SDK: one POST). The idempotency key makes a retried send of the
 * same items a no-op on Resend's side. Errors carry the HTTP status only (never the body we sent).
 */
export class ResendEmailClient implements EmailClient {
  readonly name = "resend";

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const response = await this.fetcher(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": message.idempotencyKey,
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Resend responded ${response.status}`);
  }
}
