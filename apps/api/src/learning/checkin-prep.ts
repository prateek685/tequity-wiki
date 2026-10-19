import { Injectable } from "@nestjs/common";
import {
  type CheckinPrepResponse,
  checkinPrepResponse,
  type SaveCheckinPrepRequest,
} from "@portal/contracts";
import { requireLearner } from "./learner.js";
import { asContract } from "../common/contract.js";
import { DomainError } from "../common/domain-error.js";
import { PrismaService, type Tx } from "../prisma/prisma.service.js";

/**
 * The engineer's notes for a check-in (GET and PUT /api/me/checkins/:day): a live spot-check, where they
 * are stuck, the support they need. Optional, editable until the manager records that check-in. Their
 * manager reads them on the check-in form.
 */
@Injectable()
export class CheckinPrepService {
  constructor(private readonly prisma: PrismaService) {}

  view(userId: string, day: number): Promise<CheckinPrepResponse> {
    return this.prisma.withUser(userId, (tx) => this.load(tx, userId, day));
  }

  save(userId: string, day: number, request: SaveCheckinPrepRequest): Promise<CheckinPrepResponse> {
    return this.prisma.withUser(userId, async (tx) => {
      const learner = await requireLearner(tx, userId);
      if (!learner.completedDays.has(day)) throw new DomainError("CHECKIN_NOT_REACHED");
      const enrollmentId = learner.enrollment.id;
      if (
        await tx.checkin.findUnique({ where: { enrollmentId_afterDay: { enrollmentId, afterDay: day } } })
      ) {
        throw new DomainError("CHECKIN_LOCKED");
      }
      const notes = { spotCheck: request.spotCheck, stuck: request.stuck, support: request.support };
      await tx.checkinPrep.upsert({
        where: { enrollmentId_afterDay: { enrollmentId, afterDay: day } },
        create: { enrollmentId, userId, afterDay: day, ...notes },
        update: { ...notes, updatedAt: new Date() },
      });
      return this.load(tx, userId, day);
    });
  }

  private async load(tx: Tx, userId: string, day: number): Promise<CheckinPrepResponse> {
    const learner = await requireLearner(tx, userId);
    const key = { enrollmentId_afterDay: { enrollmentId: learner.enrollment.id, afterDay: day } };
    const prep = await tx.checkinPrep.findUnique({
      where: key,
      select: { spotCheck: true, stuck: true, support: true, updatedAt: true },
    });
    const recorded = await tx.checkin.findUnique({ where: key, select: { id: true } });
    return asContract(checkinPrepResponse, {
      afterDay: day,
      reached: learner.completedDays.has(day),
      locked: recorded !== null,
      prep: prep ? { ...prep, updatedAt: prep.updatedAt.toISOString() } : null,
    });
  }
}
