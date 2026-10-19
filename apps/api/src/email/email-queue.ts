import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import { Queue } from "bullmq";
import { PinoLogger } from "nestjs-pino";
import { EMAIL_JOB_OPTIONS, emailJobId } from "./email.js";
import { JOB, QUEUE } from "../jobs/queues.js";

/** Queueing never holds up the run for longer than this. */
const ENQUEUE_TIMEOUT_MS = 5_000;

/**
 * Queues one email job per manager with pending items. Never throws: the items stay `pending` in
 * email_log and the next hourly run queues them again.
 */
@Injectable()
export class EmailQueue {
  constructor(
    @InjectQueue(QUEUE.email) private readonly queue: Queue,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(EmailQueue.name);
  }

  async enqueue(recipientIds: readonly string[], now = new Date()): Promise<void> {
    if (recipientIds.length === 0) return;
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timed out")), ENQUEUE_TIMEOUT_MS);
    });
    const adding = this.queue.addBulk(
      recipientIds.map((recipientId) => ({
        name: JOB.sendEmail,
        data: { recipientId },
        opts: { ...EMAIL_JOB_OPTIONS, jobId: emailJobId(recipientId, now) },
      })),
    );
    adding.catch(() => undefined);
    try {
      await Promise.race([adding, timeout]);
    } catch (error) {
      this.logger.warn(
        { count: recipientIds.length, error: error instanceof Error ? error.message : String(error) },
        "email jobs not queued; the next run will queue them",
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
