import { Injectable } from "@nestjs/common";
import { type ListTeamsResponse } from "@portal/contracts";
import { audit } from "../common/audit.js";
import { pageWindow } from "../common/paging.js";
import { PrismaService } from "../prisma/prisma.service.js";

/** Admin team management, run as the calling admin (row-level security applies). */
@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  list(adminId: string, page: number): Promise<ListTeamsResponse> {
    return this.prisma.withUser(adminId, async (tx) => {
      const [teams, managers, total] = await Promise.all([
        tx.team.findMany({
          ...pageWindow(page),
          orderBy: [{ name: "asc" }, { id: "asc" }],
          select: {
            id: true,
            name: true,
            _count: { select: { members: true } },
            managers: { select: { user: { select: { id: true, name: true } } } },
          },
        }),
        tx.user.findMany({
          where: { role: "manager", status: "active" },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
        tx.team.count(),
      ]);
      return {
        total,
        managers,
        teams: teams.map((team) => ({
          id: team.id,
          name: team.name,
          engineerCount: team._count.members,
          managers: team.managers.map((link) => link.user),
        })),
      };
    });
  }

  async create(adminId: string, name: string): Promise<void> {
    await this.prisma.withUser(adminId, async (tx) => {
      const team = await tx.team.create({ data: { name }, select: { id: true } });
      await audit(tx, "team.created", "team", team.id, null, { name });
    });
  }

  async addManager(adminId: string, teamId: string, userId: string): Promise<void> {
    await this.prisma.withUser(adminId, async (tx) => {
      await tx.teamManager.create({ data: { teamId, userId } });
      await audit(tx, "team.manager_added", "team", teamId, null, { userId });
    });
  }

  async removeManager(adminId: string, teamId: string, userId: string): Promise<void> {
    await this.prisma.withUser(adminId, async (tx) => {
      await tx.teamManager.delete({ where: { teamId_userId: { teamId, userId } } });
      await audit(tx, "team.manager_removed", "team", teamId, { userId }, null);
    });
  }
}
