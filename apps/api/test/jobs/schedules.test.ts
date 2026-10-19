/**
 * Background jobs against the local Redis: schedules are registered once however many workers
 * start, and the maintenance processor runs and retries jobs. Uses its own key prefix.
 */
import { Queue, QueueEvents, Worker } from "bullmq";
import { PinoLogger } from "nestjs-pino";
import { afterAll, describe, expect, it } from "vitest";
import { parseEnv } from "../../src/config/env.js";
import { MaintenanceProcessor } from "../../src/jobs/maintenance.processor.js";
import { JOB, QUEUE, redisConnection } from "../../src/jobs/queues.js";
import {
  HEARTBEAT_SCHEDULER_ID,
  RED_FLAGS_SCHEDULER_ID,
  SCORING_SWEEP_SCHEDULER_ID,
  Schedules,
} from "../../src/jobs/schedules.js";
import { PrismaService } from "../../src/prisma/prisma.service.js";
import { type RedFlagRunner } from "../../src/red-flags/red-flag-run.js";
import { ScoringQueue } from "../../src/scoring/scoring-queue.js";

const env = parseEnv(process.env);
const options = { connection: redisConnection(env.REDIS_URL), prefix: `test-${Date.now().toString(36)}` };
const queue = new Queue(QUEUE.maintenance, options);
const scoringQueue = new Queue(QUEUE.scoring, options);
const prisma = new PrismaService(env);
const logger = new PinoLogger({ pinoHttp: { level: "silent" } });

afterAll(async () => {
  await queue.obliterate({ force: true });
  await queue.close();
  await scoringQueue.obliterate({ force: true });
  await scoringQueue.close();
  await prisma.onModuleDestroy();
});

describe("schedules", () => {
  it("registers exactly one heartbeat, scoring sweep and red-flag schedule even when several workers start", async () => {
    await Promise.all([
      new Schedules(queue).onApplicationBootstrap(),
      new Schedules(queue).onApplicationBootstrap(),
    ]);
    await new Schedules(queue).onApplicationBootstrap();
    const schedulers = await queue.getJobSchedulers();
    expect(schedulers.map((scheduler) => scheduler.key).sort()).toEqual(
      [HEARTBEAT_SCHEDULER_ID, SCORING_SWEEP_SCHEDULER_ID, RED_FLAGS_SCHEDULER_ID].sort(),
    );
  });
});

describe("maintenance processor", () => {
  it("runs the heartbeat and fails (with retries) on unknown jobs", async () => {
    // The red-flag run isn't exercised here (it would touch every engineer in the dev database).
    const redFlags = {
      runAll: () => Promise.reject(new Error("not in this test")),
    } as unknown as RedFlagRunner;
    const processor = new MaintenanceProcessor(
      prisma,
      new ScoringQueue(scoringQueue, logger),
      logger,
      redFlags,
    );
    const worker = new Worker(QUEUE.maintenance, (job) => processor.process(job), options);
    const events = new QueueEvents(QUEUE.maintenance, options);
    await events.waitUntilReady();
    try {
      const heartbeat = await queue.add(JOB.heartbeat, {});
      await heartbeat.waitUntilFinished(events, 10_000);
      expect(await heartbeat.getState()).toBe("completed");

      const unknown = await queue.add("unknown", {}, { attempts: 2, backoff: { type: "fixed", delay: 10 } });
      await expect(unknown.waitUntilFinished(events, 10_000)).rejects.toThrow(/Unknown maintenance job/);
      const failed = await queue.getJob(unknown.id ?? "");
      expect(failed?.attemptsMade).toBe(2);
    } finally {
      await worker.close();
      await events.close();
    }
  });
});
