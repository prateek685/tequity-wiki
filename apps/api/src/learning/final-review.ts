import { Injectable } from "@nestjs/common";
import { type FinalReviewViewResponse, finalReviewViewResponse } from "@portal/contracts";
import { requireLearner } from "./learner.js";
import { finalStatus, loadCaseDates, loadFinalReviews, loadLiveCalls, pendingLiveDays } from "./phase3.js";
import { asContract } from "../common/contract.js";
import { PrismaService } from "../prisma/prisma.service.js";

/** The engineer's Final review page (GET /api/me/final-review). The engineer books it with their manager. */
@Injectable()
export class FinalReviewService {
  constructor(private readonly prisma: PrismaService) {}

  view(userId: string): Promise<FinalReviewViewResponse> {
    return this.prisma.withUser(userId, async (tx) => {
      const learner = await requireLearner(tx, userId);
      const enrollmentId = learner.enrollment.id;
      const sharedAt = (await loadCaseDates(tx, [enrollmentId])).get(enrollmentId) ?? null;
      const result = (await loadFinalReviews(tx, [enrollmentId])).get(enrollmentId) ?? null;
      const live = (await loadLiveCalls(tx, [enrollmentId])).get(enrollmentId) ?? [];
      return asContract(finalReviewViewResponse, {
        status: finalStatus(sharedAt !== null, result),
        reachedAt: sharedAt?.toISOString() ?? null,
        pendingLive: pendingLiveDays(live),
        result,
        unlockAll: learner.unlockAll,
      });
    });
  }
}
