import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { HealthController } from "./health.controller.js";
import { JobsModule } from "../jobs/jobs.module.js";

@Module({ imports: [TerminusModule, JobsModule], controllers: [HealthController] })
export class HealthModule {}
