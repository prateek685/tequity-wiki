import { InjectQueue } from "@nestjs/bullmq";
import { Controller, Get } from "@nestjs/common";
import { HealthCheck, HealthCheckService, HealthIndicatorService } from "@nestjs/terminus";
import { Queue } from "bullmq";
import { Public } from "../auth/decorators.js";
import { QUEUE } from "../jobs/queues.js";
import { PrismaService } from "../prisma/prisma.service.js";

/** Liveness of the process and its dependencies: `/api/health` (API) and `/health` (worker). */
@Controller("health")
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicators: HealthIndicatorService,
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE.maintenance) private readonly queue: Queue,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      async () => {
        const indicator = this.indicators.check("database");
        try {
          await this.prisma.system.$queryRaw`SELECT 1`;
          return indicator.up();
        } catch {
          return indicator.down();
        }
      },
      async () => {
        const indicator = this.indicators.check("redis");
        try {
          // A real round trip through BullMQ's backend (BullMQ 6 no longer exposes the raw client).
          await this.queue.getJobCounts("wait");
          return indicator.up();
        } catch {
          return indicator.down();
        }
      },
    ]);
  }
}
