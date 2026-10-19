import { Processor, WorkerHost } from "@nestjs/bullmq";
import { type Job } from "bullmq";
import { PinoLogger } from "nestjs-pino";
import { JOB, QUEUE } from "./queues.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { RedFlagRunner } from "../red-flags/red-flag-run.js";
import { ScoringQueue } from "../scoring/scoring-queue.js";
import { SWEEP_OLDER_THAN } from "../scoring/scoring.js";

/**
 * Maintenance jobs. The heartbeat proves the worker, Redis and Postgres are alive end to end, and keeps
 * a managed database from pausing for inactivity. The scoring sweep re-queues answers left `pending`
 * (saved while Redis was down, or lost from the queue); queueing is idempotent per row and revision. The
 * hourly red-flag run raises and clears flags and queues the manager emails (idempotent).
 */
@Processor(QUEUE.maintenance)
export class MaintenanceProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringQueue,
    private readonly logger: PinoLogger,
    private readonly redFlags: RedFlagRunner,
  ) {
    super();
    this.logger.setContext(MaintenanceProcessor.name);
  }

  async process(job: Job): Promise<void> {
    if (job.name === JOB.heartbeat) {
      await this.prisma.system.$queryRaw`SELECT 1`;
      this.logger.debug({ jobId: job.id }, "heartbeat ok");
      return;
    }
    if (job.name === JOB.scoringSweep) {
      const rows = await this.prisma.system.$queryRaw<{ id: string; user_id: string; revision: number }[]>`
        SELECT id, user_id, revision FROM app.ai_scores_stale_pending(${SWEEP_OLDER_THAN}::interval)`;
      await this.scoring.enqueue(
        rows.map((row) => ({ aiScoreId: row.id, userId: row.user_id, revision: row.revision })),
      );
      if (rows.length > 0)
        this.logger.info({ count: rows.length }, "scoring sweep re-queued pending answers");
      return;
    }
    if (job.name === JOB.redFlags) {
      await this.redFlags.runAll();
      return;
    }
    throw new Error(`Unknown maintenance job: ${job.name}`);
  }
}
