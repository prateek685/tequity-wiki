import { Module } from "@nestjs/common";
import { loggingModule } from "./common/logging.js";
import { ConfigModule } from "./config/config.module.js";
import { EmailModule } from "./email/email.module.js";
import { EmailProcessor } from "./email/email.processor.js";
import { HealthModule } from "./health/health.module.js";
import { JobsModule } from "./jobs/jobs.module.js";
import { MaintenanceProcessor } from "./jobs/maintenance.processor.js";
import { Schedules } from "./jobs/schedules.js";
import { LlmModule } from "./llm/llm.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { RedFlagRunner } from "./red-flags/red-flag-run.js";
import { ScoringProcessor } from "./scoring/scoring.processor.js";

/**
 * The worker process: BullMQ processors and schedules, plus a /health endpoint. No API routes. The only
 * process that calls the language model (AI scoring) and sends email (managers only: check-ins due, new
 * red flags).
 */
@Module({
  imports: [
    ConfigModule,
    loggingModule("worker"),
    PrismaModule,
    JobsModule,
    LlmModule,
    EmailModule,
    HealthModule,
  ],
  providers: [MaintenanceProcessor, ScoringProcessor, EmailProcessor, RedFlagRunner, Schedules],
})
export class WorkerModule {}
