import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, type OnApplicationBootstrap } from "@nestjs/common";
import { type Job } from "bullmq";
import { PinoLogger } from "nestjs-pino";
import { EMAIL_CLIENT, type EmailClient, emailDomain } from "./email-client.js";
import { emailJob, type EmailItem, idempotencyKey, parseEmailItem, renderManagerEmail } from "./email.js";
import { ENV } from "../config/config.module.js";
import { type Env } from "../config/env.js";
import { QUEUE } from "../jobs/queues.js";
import { PrismaService } from "../prisma/prisma.service.js";

export type EmailOutcome = "sent" | "nothing" | "failed";

interface PendingRow {
  id: string;
  template: string;
  payload: unknown;
  email: string;
  name: string;
  active: boolean;
}

/**
 * Sends one manager's pending email items as one email (queue `email`). Reads and marks the items
 * through SECURITY DEFINER functions (system only). An error fails the attempt (BullMQ retries with
 * backoff); after the last attempt the items are marked failed. Never logs the address or the body.
 *
 * Without an email client (production without RESEND_API_KEY / EMAIL_FROM) the worker doesn't take
 * email jobs: they wait in the queue and the items stay pending.
 */
@Processor(QUEUE.email, { autorun: false })
export class EmailProcessor extends WorkerHost implements OnApplicationBootstrap {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_CLIENT) private readonly client: EmailClient | null,
    @Inject(ENV) private readonly env: Env,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(EmailProcessor.name);
  }

  onApplicationBootstrap(): void {
    if (!this.client) {
      this.logger.warn("Email is off: no RESEND_API_KEY / EMAIL_FROM. Manager emails stay pending.");
      return;
    }
    this.logger.info({ client: this.client.name }, "manager email on");
    this.worker.run().catch((error: unknown) => {
      this.logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "email worker stopped",
      );
    });
  }

  async process(job: Job): Promise<EmailOutcome> {
    const { recipientId } = emailJob.parse(job.data);
    return this.send(recipientId, job.attemptsMade + 1 >= (job.opts.attempts ?? 1));
  }

  /** Send the recipient's pending items; `last`: this is the final attempt (mark failed on error). */
  async send(recipientId: string, last: boolean): Promise<EmailOutcome> {
    if (!this.client) throw new Error("No email client configured");
    const rows = await this.prisma.system.$queryRaw<PendingRow[]>`
      SELECT id, template, payload, email, name, active FROM app.email_pending(${recipientId}::uuid)`;
    if (rows.length === 0) return "nothing";
    const items: { id: string; item: EmailItem }[] = [];
    const broken: string[] = [];
    for (const row of rows) {
      const item = parseEmailItem(row);
      if (item) items.push({ id: row.id, item });
      else broken.push(row.id);
    }
    if (broken.length) await this.mark(broken, "failed");
    const recipient = rows[0];
    if (!recipient?.active || items.length === 0) {
      await this.mark(
        items.map((i) => i.id),
        "failed",
      );
      this.logger.warn({ recipientId, items: items.length }, "manager email not sent: recipient inactive");
      return "failed";
    }
    const ids = items.map((i) => i.id);
    const message = renderManagerEmail({
      managerName: recipient.name,
      items: items.map((i) => i.item),
      origin: this.env.PORTAL_ORIGIN,
    });
    const templates = items.map((i) => i.item.template);
    try {
      await this.client.send({
        to: recipient.email,
        ...message,
        templates,
        idempotencyKey: idempotencyKey(ids),
      });
    } catch (error) {
      if (last) await this.mark(ids, "failed");
      this.logger.warn(
        {
          recipientId,
          items: ids.length,
          last,
          error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
        },
        "manager email failed",
      );
      throw error;
    }
    await this.mark(ids, "sent");
    this.logger.info(
      {
        recipientId,
        to: emailDomain(recipient.email),
        items: ids.length,
        templates: [...new Set(templates)],
      },
      "manager email sent",
    );
    return "sent";
  }

  private async mark(ids: readonly string[], status: "sent" | "failed"): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.system.$queryRaw`SELECT app.email_mark(${[...ids]}::uuid[], ${status})`;
  }
}
