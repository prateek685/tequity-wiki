import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AuthGuard } from "./auth/auth.guard.js";
import { AuthModule } from "./auth/auth.module.js";
import { ApiExceptionFilter } from "./common/api-exception.filter.js";
import { CsrfGuard } from "./common/csrf.guard.js";
import { loggingModule } from "./common/logging.js";
import { ConfigModule } from "./config/config.module.js";
import { HealthModule } from "./health/health.module.js";
import { JobsModule } from "./jobs/jobs.module.js";
import { LearningModule } from "./learning/learning.module.js";
import { LibraryModule } from "./library/library.js";
import { ManagerModule } from "./manager/manager.module.js";
import { PeopleModule } from "./people/people.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { SettingsModule } from "./settings/settings.module.js";
import { TeamsModule } from "./teams/teams.module.js";
import { UsersModule } from "./users/users.module.js";

/** Requests per IP per minute for ordinary API routes (sign-in routes have a stricter limit). */
const DEFAULT_RATE_LIMIT = { name: "default", ttl: 60_000, limit: 300 };

@Module({
  imports: [
    ConfigModule,
    loggingModule("api"),
    ThrottlerModule.forRoot({ throttlers: [DEFAULT_RATE_LIMIT] }),
    PrismaModule,
    JobsModule,
    AuthModule.register(),
    UsersModule,
    TeamsModule,
    PeopleModule,
    LearningModule,
    LibraryModule,
    ManagerModule,
    SettingsModule,
    HealthModule,
  ],
  providers: [
    // Guards run in this order: rate limit → CSRF → session and role.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
