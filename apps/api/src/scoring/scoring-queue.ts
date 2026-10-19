import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import { Queue } from "bullmq";
import { PinoLogger } from "nestjs-pino";
import { SCORE_JOB_OPTIONS, scoreJobId, type ScoreRef } from "./scoring.js";
import { JOB, QUEUE } from "../jobs/queues.js";

/** Queueing never holds up the engineer for longer than this. */
const ENQUEUE_TIMEOUT_MS = 2_000;

/**
 * Queues scoring jobs after the answer is committed. Never throws: if Redis is down the answer is still
 * saved as `pending` and the sweep queues it later (progress never waits for scoring).
 */
@Injectable()
export class ScoringQueue {
  constructor(
    @InjectQueue(QUEUE.scoring) private readonly queue: Queue,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ScoringQueue.name);
  }

  async enqueue(refs: readonly ScoreRef[]): Promise<void> {
    if (refs.length === 0) return;
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("timed out")), ENQUEUE_TIMEOUT_MS);
    });
    const adding = this.queue.addBulk(
      refs.map((ref) => ({
        name: JOB.score,
        data: ref,
        opts: { ...SCORE_JOB_OPTIONS, jobId: scoreJobId(ref) },
      })),
    );
    // A late failure after the timeout is already reported below.
    adding.catch(() => undefined);
    try {
      await Promise.race([adding, timeout]);
    } catch (error) {
      this.logger.warn(
        { count: refs.length, error: error instanceof Error ? error.message : String(error) },
        "scoring jobs not queued; the sweep will queue them",
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
