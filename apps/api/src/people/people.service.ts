import { Injectable } from "@nestjs/common";
import { type ListMyEngineersResponse, type MyEnrollment } from "@portal/contracts";
import { isoFromDate } from "../common/dates.js";
import { pageWindow } from "../common/paging.js";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class PeopleService {
  constructor(private readonly prisma: PrismaService) {}

  /** Engineer: their own active enrollment (start and target date). */
  myEnrollment(userId: string): Promise<MyEnrollment> {
    return this.prisma.withUser(userId, async (tx) => {
      const enrollment = await tx.enrollment.findFirst({
        where: { userId, status: "active" },
        orderBy: { cycleNo: "desc" },
        select: { startDate: true, targetDate: true, cycleNo: true },
      });
      return enrollment
        ? {
            startDate: isoFromDate(enrollment.startDate),
            targetDate: isoFromDate(enrollment.targetDate),
            cycleNo: enrollment.cycleNo,
          }
        : null;
    });
  }

  /**
   * Manager: engineers on the teams they manage. Row-level security decides who is visible; this
   * query doesn't filter by team itself, so a policy bug would show up in the privacy tests.
   */
  myEngineers(managerId: string, page: number): Promise<ListMyEngineersResponse> {
    return this.prisma.withUser(managerId, async (tx) => {
      const where = { userId: { not: managerId } };
      const [members, total] = await Promise.all([
        tx.teamMember.findMany({
          where,
          ...pageWindow(page),
          orderBy: [{ team: { name: "asc" } }, { user: { name: "asc" } }, { userId: "asc" }],
          select: {
            team: { select: { name: true } },
            user: {
              select: {
                id: true,
                name: true,
                enrollments: {
                  where: { status: "active" },
                  orderBy: { cycleNo: "desc" },
                  take: 1,
                  select: { startDate: true, targetDate: true },
                },
              },
            },
          },
        }),
        tx.teamMember.count({ where }),
      ]);
      const engineers = members.map((member) => {
        const enrollment = member.user.enrollments[0];
        return {
          id: member.user.id,
          name: member.user.name,
          teamName: member.team.name,
          startDate: enrollment ? isoFromDate(enrollment.startDate) : null,
          targetDate: enrollment ? isoFromDate(enrollment.targetDate) : null,
        };
      });
      return { engineers, total };
    });
  }
}
