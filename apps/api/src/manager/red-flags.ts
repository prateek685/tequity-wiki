import { Controller, Get, HttpCode, Injectable, Param, Post, Query } from "@nestjs/common";
import {
  type Me,
  RED_FLAG_KINDS,
  type RedFlag,
  redFlagListQuery,
  type RedFlagListResponse,
  redFlagListResponse,
  redFlagParam,
} from "@portal/contracts";
import { z } from "zod";
import { authorNames, personOf } from "./authors.js";
import { CurrentUser, Roles } from "../auth/decorators.js";
import { audit } from "../common/audit.js";
import { asContract } from "../common/contract.js";
import { DomainError } from "../common/domain-error.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { PrismaService, type Tx } from "../prisma/prisma.service.js";

const kind = z.enum(RED_FLAG_KINDS);

/** At most this many flags per list (newest first). */
const LIST_LIMIT = 200;

type Status = "open" | "acknowledged";

/**
 * The manager's red flags (packages/contracts/src/red-flags.ts). Runs as the manager: row-level security
 * returns only flags of engineers on their teams, and lets only them acknowledge one (acknowledged_*
 * columns only). Open = not acknowledged yet, whether or not the signal has cleared since.
 */
@Injectable()
export class ManagerRedFlagService {
  constructor(private readonly prisma: PrismaService) {}

  list(managerId: string, status: Status): Promise<RedFlagListResponse> {
    return this.prisma.withUser(managerId, (tx) => this.buildList(tx, status));
  }

  acknowledge(managerId: string, id: string): Promise<RedFlagListResponse> {
    return this.prisma.withUser(managerId, async (tx) => {
      const flag = await tx.redFlag.findUnique({
        where: { id },
        select: { id: true, userId: true, kind: true, acknowledgedAt: true },
      });
      if (!flag) throw new DomainError("NOT_FOUND");
      // Acknowledging twice (e.g. two managers at once) keeps the first; the list comes back either way.
      const updated = await tx.redFlag.updateMany({
        where: { id, acknowledgedAt: null },
        data: { acknowledgedAt: new Date(), acknowledgedBy: managerId },
      });
      if (updated.count > 0) {
        await audit(tx, "red_flag.acknowledged", "red_flag", id, null, {
          engineer: flag.userId,
          kind: flag.kind,
        });
      }
      return this.buildList(tx, "open");
    });
  }

  private async buildList(tx: Tx, status: Status): Promise<RedFlagListResponse> {
    const rows = await tx.redFlag.findMany({
      where: status === "open" ? { acknowledgedAt: null } : { acknowledgedAt: { not: null } },
      orderBy: status === "open" ? [{ raisedAt: "desc" }, { id: "asc" }] : [{ acknowledgedAt: "desc" }],
      take: LIST_LIMIT,
      select: {
        id: true,
        kind: true,
        detail: true,
        raisedAt: true,
        acknowledgedAt: true,
        acknowledgedBy: true,
        user: { select: { id: true, name: true } },
      },
    });
    const open = await tx.redFlag.count({ where: { acknowledgedAt: null } });
    const names = await authorNames(
      tx,
      rows.flatMap((row) => (row.acknowledgedBy ? [row.acknowledgedBy] : [])),
    );
    const flags: RedFlag[] = rows.flatMap((row) => {
      const parsed = kind.safeParse(row.kind);
      if (!parsed.success) return [];
      return [
        {
          id: row.id,
          engineer: row.user,
          kind: parsed.data,
          detail: row.detail,
          raisedAt: row.raisedAt.toISOString(),
          acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
          acknowledgedBy: row.acknowledgedBy ? personOf(names, row.acknowledgedBy) : null,
        },
      ];
    });
    return asContract(redFlagListResponse, { flags, open });
  }
}

@Roles("manager")
@Controller("manager/red-flags")
export class ManagerRedFlagsController {
  constructor(private readonly flags: ManagerRedFlagService) {}

  @Get()
  list(
    @CurrentUser() user: Me,
    @Query(new ZodValidationPipe(redFlagListQuery)) query: { status: Status },
  ): Promise<RedFlagListResponse> {
    return this.flags.list(user.id, query.status);
  }

  /** Returns the open list after the acknowledgement. */
  @Post(":id/acknowledge")
  @HttpCode(200)
  acknowledge(
    @CurrentUser() user: Me,
    @Param(new ZodValidationPipe(redFlagParam)) params: { id: string },
  ): Promise<RedFlagListResponse> {
    return this.flags.acknowledge(user.id, params.id);
  }
}
