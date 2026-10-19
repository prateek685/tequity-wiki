import { Injectable } from "@nestjs/common";
import { type ListUsersResponse, type UpdateUserAccessRequest } from "@portal/contracts";
import { audit } from "../common/audit.js";
import { dateFromIso, isoFromDate } from "../common/dates.js";
import { DomainError } from "../common/domain-error.js";
import { pageWindow } from "../common/paging.js";
import { PrismaService, type Tx } from "../prisma/prisma.service.js";

/**
 * Admin user management. Every query runs as the calling admin through `withUser`, so row-level
 * security checks these too (a non-admin gets nothing, or an error on write).
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  list(adminId: string, page: number): Promise<ListUsersResponse> {
    return this.prisma.withUser(adminId, async (tx) => {
      const [users, teams, total, pendingTotal] = await Promise.all([
        tx.user.findMany({
          ...pageWindow(page),
          orderBy: [{ status: "asc" }, { name: "asc" }, { id: "asc" }],
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            status: true,
            lastLoginAt: true,
            memberOf: { select: { teamId: true } },
            enrollments: {
              where: { status: "active" },
              orderBy: { cycleNo: "desc" },
              take: 1,
              select: { startDate: true, targetDate: true },
            },
          },
        }),
        tx.team.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
        tx.user.count(),
        tx.user.count({ where: { status: "pending" } }),
      ]);
      return {
        total,
        pendingTotal,
        teams,
        users: users.map((user) => {
          const enrollment = user.enrollments[0];
          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            status: user.status,
            lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
            teamId: user.memberOf?.teamId ?? null,
            startDate: enrollment ? isoFromDate(enrollment.startDate) : null,
            targetDate: enrollment ? isoFromDate(enrollment.targetDate) : null,
          };
        }),
      };
    });
  }

  /**
   * Apply an admin's change to one user in a single transaction, with audit entries. The database
   * rejects removing the last active admin (LAST_ADMIN) and wrong team roles.
   */
  async updateAccess(adminId: string, userId: string, input: UpdateUserAccessRequest): Promise<void> {
    await this.prisma.withUser(adminId, async (tx) => {
      const before = await tx.user.findUnique({
        where: { id: userId },
        select: { role: true, status: true, memberOf: { select: { teamId: true } } },
      });
      if (!before) throw new DomainError("NOT_FOUND");

      const roleChanged = before.role !== input.role;
      const statusChanged = before.status !== input.status;

      // An admin never changes their own role or access: another admin must do it.
      if (adminId === userId && (roleChanged || statusChanged)) throw new DomainError("SELF_ACCESS_CHANGE");

      // Approving a new engineer means giving them a team and a start date (plan §8).
      if (before.status === "pending" && input.role === "engineer" && (!input.teamId || !input.startDate)) {
        throw new DomainError("APPROVAL_NEEDS_TEAM_AND_START");
      }

      if (roleChanged || statusChanged) {
        await tx.user.update({ where: { id: userId }, data: { role: input.role, status: input.status } });
        if (roleChanged) {
          await audit(tx, "user.role_changed", "user", userId, { role: before.role }, { role: input.role });
        }
        if (statusChanged) {
          await audit(
            tx,
            "user.status_changed",
            "user",
            userId,
            { status: before.status },
            { status: input.status },
          );
        }
      }

      if (input.role !== "manager") await tx.teamManager.deleteMany({ where: { userId } });
      await this.setTeam(
        tx,
        userId,
        before.memberOf?.teamId ?? null,
        input.role === "engineer" ? input.teamId : null,
      );
      if (input.role === "engineer" && input.startDate) await this.setStartDate(tx, userId, input.startDate);
    });
  }

  private async setTeam(tx: Tx, userId: string, previous: string | null, next: string | null): Promise<void> {
    if (previous === next) return;
    if (next === null) {
      await tx.teamMember.deleteMany({ where: { userId } });
    } else {
      await tx.teamMember.upsert({
        where: { userId },
        create: { userId, teamId: next },
        update: { teamId: next },
      });
    }
    await audit(tx, "team.member_set", "user", userId, { teamId: previous }, { teamId: next });
  }

  private async setStartDate(tx: Tx, userId: string, startDate: string): Promise<void> {
    const current = await tx.enrollment.findFirst({
      where: { userId, status: "active" },
      orderBy: { cycleNo: "desc" },
      select: { id: true, startDate: true },
    });
    if (!current) {
      const created = await tx.enrollment.create({
        data: { userId, startDate: dateFromIso(startDate) },
        select: { id: true },
      });
      await audit(tx, "enrollment.created", "enrollment", created.id, null, { startDate });
      return;
    }
    const previous = isoFromDate(current.startDate);
    if (previous === startDate) return;
    await tx.enrollment.update({ where: { id: current.id }, data: { startDate: dateFromIso(startDate) } });
    await audit(
      tx,
      "enrollment.start_changed",
      "enrollment",
      current.id,
      { startDate: previous },
      { startDate },
    );
  }
}
