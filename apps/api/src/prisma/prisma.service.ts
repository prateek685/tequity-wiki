import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { ENV } from "../config/config.module.js";
import { type Env } from "../config/env.js";
import { type Prisma, PrismaClient } from "../generated/prisma/client.js";

export type Tx = Prisma.TransactionClient;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * The only database client (docs/PORTAL_PLAN.md §5). It connects as `app_user`, which has no
 * BYPASSRLS: every query is filtered by row-level security. Feature code reaches user data only
 * through `withUser`; the narrow SECURITY DEFINER functions (sign-in, sessions) go through `system`.
 */
@Injectable()
export class PrismaService implements OnModuleDestroy {
  private readonly client: PrismaClient;

  constructor(@Inject(ENV) env: Env) {
    this.client = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
  }

  /**
   * Run database work as a specific user (§5 "Per-request identity"). Opens one transaction, sets
   * `app.user_id` for that transaction only, and runs `work` inside it. The user's role is never
   * passed in: the database reads it from the users table.
   */
  async withUser<T>(userId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
    if (!UUID.test(userId)) throw new Error("withUser: invalid user id");
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
      return work(tx);
    });
  }

  /** For calls to SECURITY DEFINER functions that work without a user identity. No table access. */
  get system(): Pick<PrismaClient, "$queryRaw" | "$executeRaw"> {
    return this.client;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
