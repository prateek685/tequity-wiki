import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { Queue } from "bullmq";
import { JOB, QUEUE } from "./queues.js";
import { SWEEP_EVERY_MS } from "../scoring/scoring.js";

export const HEARTBEAT_SCHEDULER_ID = "maintenance.heartbeat";
export const HEARTBEAT_EVERY_MS = 60_000;
export const SCORING_SWEEP_SCHEDULER_ID = "maintenance.scoring-sweep";
export const RED_FLAGS_SCHEDULER_ID = "maintenance.red-flags";
/** Red flags (and the manager emails they lead to) are checked every hour (docs/PORTAL_PLAN.md §8). */
export const RED_FLAGS_EVERY_MS = 3_600_000;

/**
 * Registers the recurring jobs when a worker starts. `upsertJobScheduler` is idempotent: however many
 * workers start, there is exactly one schedule per id (unlike @nestjs/schedule, which runs per process).
 */
@Injectable()
export class Schedules implements OnApplicationBootstrap {
  constructor(@InjectQueue(QUEUE.maintenance) private readonly maintenance: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.maintenance.upsertJobScheduler(
      HEARTBEAT_SCHEDULER_ID,
      { every: HEARTBEAT_EVERY_MS },
      { name: JOB.heartbeat, opts: { removeOnComplete: 100, removeOnFail: 500 } },
    );
    // Re-queues answers still pending after 10 minutes (e.g. saved while Redis was down).
    await this.maintenance.upsertJobScheduler(
      SCORING_SWEEP_SCHEDULER_ID,
      { every: SWEEP_EVERY_MS },
      { name: JOB.scoringSweep, opts: { removeOnComplete: 100, removeOnFail: 500 } },
    );
    // An `every` schedule also runs once when it is first registered.
    await this.maintenance.upsertJobScheduler(
      RED_FLAGS_SCHEDULER_ID,
      { every: RED_FLAGS_EVERY_MS },
      { name: JOB.redFlags, opts: { removeOnComplete: 100, removeOnFail: 500 } },
    );
  }
}
