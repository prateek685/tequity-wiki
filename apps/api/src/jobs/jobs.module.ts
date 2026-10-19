import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { QUEUE, redisConnection } from "./queues.js";
import { ENV } from "../config/config.module.js";
import { type Env } from "../config/env.js";
import { EmailQueue } from "../email/email-queue.js";
import { ScoringQueue } from "../scoring/scoring-queue.js";

/** Redis connection and queues, shared by the API (to enqueue) and the worker (to process). */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({ connection: redisConnection(env.REDIS_URL) }),
    }),
    BullModule.registerQueue({ name: QUEUE.maintenance }, { name: QUEUE.scoring }, { name: QUEUE.email }),
  ],
  providers: [ScoringQueue, EmailQueue],
  exports: [BullModule, ScoringQueue, EmailQueue],
})
export class JobsModule {}
