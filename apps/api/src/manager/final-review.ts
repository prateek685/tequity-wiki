import { Body, Controller, Get, Injectable, Param, Put } from "@nestjs/common";
import {
  finalOutcome,
  type FinalReviewFormResponse,
  finalReviewFormResponse,
  type FinalReviewListResponse,
  finalReviewListResponse,
  gateMaths,
  idParam,
  type Me,
  type SaveFinalReviewRequest,
  saveFinalReviewRequest,
} from "@portal/contracts";
import { managedMembers, requireManagedEngineer, type ManagedEngineer } from "./engineer.js";
import { CurrentUser, Roles } from "../auth/decorators.js";
import { audit } from "../common/audit.js";
import { asContract } from "../common/contract.js";
import { DomainError } from "../common/domain-error.js";
import { RequestValidationError, ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { loadLearners } from "../learning/learner.js";
import {
  finalStatus,
  loadCaseDates,
  loadFinalReviews,
  loadLiveCalls,
  loadLiveDays,
  loadReadinessCase,
  lockFinalReview,
  pendingLiveDays,
} from "../learning/phase3.js";
import { PrismaService, type Tx } from "../prisma/prisma.service.js";
import { fullCriteria } from "../rules/gates.js";

/**
 * The manager's final review screens (packages/contracts/src/final-review.ts "Manager"). Every query runs
 * as the manager through `withUser`: row-level security limits them to engineers on their teams, and only a
 * manager of the team can record the result, once the readiness case is shared (policies on final_reviews).
 */
@Injectable()
export class ManagerFinalReviewService {
  constructor(private readonly prisma: PrismaService) {}

  /** Engineers whose readiness case is shared (to book or recorded), by name. */
  list(managerId: string): Promise<FinalReviewListResponse> {
    return this.prisma.withUser(managerId, async (tx) => {
      const members = await managedMembers(tx, managerId);
      const learners = await loadLearners(
        tx,
        members.map((member) => member.user.id),
      );
      const ids = [...learners.values()].map((learner) => learner.enrollment.id);
      const shared = await loadCaseDates(tx, ids);
      const results = await loadFinalReviews(tx, ids);
      const live = await loadLiveCalls(tx, ids, await loadLiveDays(tx));
      const reviews: FinalReviewListResponse["reviews"] = [];
      for (const member of members) {
        const learner = learners.get(member.user.id);
        const sharedAt = learner && shared.get(learner.enrollment.id);
        if (!learner || !sharedAt) continue;
        const result = results.get(learner.enrollment.id) ?? null;
        reviews.push({
          engineer: { id: member.user.id, name: member.user.name },
          status: finalStatus(true, result),
          reachedAt: sharedAt.toISOString(),
          pendingLive: pendingLiveDays(live.get(learner.enrollment.id) ?? []).length,
          result: result && { outcome: result.outcome, average: result.average, heldAt: result.heldAt },
        });
      }
      return asContract(finalReviewListResponse, { reviews });
    });
  }

  form(managerId: string, engineerId: string): Promise<FinalReviewFormResponse> {
    return this.prisma.withUser(managerId, async (tx) =>
      this.buildForm(tx, await requireManagedEngineer(tx, managerId, engineerId)),
    );
  }

  /**
   * Record (or correct) the final review. The maths are recomputed here; an outcome other than the one the
   * scores point to needs an override note. Refused while a live-call day is still "later".
   */
  save(
    managerId: string,
    engineerId: string,
    request: SaveFinalReviewRequest,
  ): Promise<FinalReviewFormResponse> {
    return this.prisma.withUser(managerId, async (tx) => {
      const before = await requireManagedEngineer(tx, managerId, engineerId);
      const enrollmentId = before.learner.enrollment.id;
      await lockFinalReview(tx, enrollmentId);
      if (!(await loadCaseDates(tx, [enrollmentId])).has(enrollmentId))
        throw new DomainError("FINAL_NOT_REACHED");
      const live = (await loadLiveCalls(tx, [enrollmentId])).get(enrollmentId) ?? [];
      if (pendingLiveDays(live).length > 0) throw new DomainError("LIVE_CALLS_PENDING");

      const maths = gateMaths(request.criteria);
      if (maths.scored === 0) {
        throw new RequestValidationError(
          { criteria: "Score at least one criterion." },
          "Score at least one criterion.",
        );
      }
      const suggested = finalOutcome(request.criteria);
      const overridden = request.outcome !== suggested;
      if (overridden && request.overrideNote === "") throw new DomainError("OVERRIDE_NOTE_REQUIRED");

      const previous = await tx.finalReview.findUnique({
        where: { enrollmentId },
        select: { outcome: true, average: true },
      });
      const fields = {
        heldAt: new Date(request.heldAt),
        observer: request.observer,
        call: request.call,
        criteria: fullCriteria(request.criteria),
        scored: maths.scored,
        average: maths.average,
        lowest: maths.lowest,
        outcome: request.outcome,
        rag: request.rag,
        note: request.note,
        overrideNote: overridden ? request.overrideNote : "",
        managerId,
      };
      const saved = await tx.finalReview.upsert({
        where: { enrollmentId },
        create: { enrollmentId, userId: engineerId, ...fields },
        update: { ...fields, updatedAt: new Date() },
        select: { id: true },
      });
      // Numbers only: never the notes or the call name.
      await audit(tx, "final_review.recorded", "final_review", saved.id, previous, {
        engineer: engineerId,
        outcome: request.outcome,
        average: maths.average,
        lowest: maths.lowest,
        suggested,
        overridden,
      });
      return this.buildForm(tx, await requireManagedEngineer(tx, managerId, engineerId));
    });
  }

  private async buildForm(tx: Tx, engineer: ManagedEngineer): Promise<FinalReviewFormResponse> {
    const enrollmentId = engineer.learner.enrollment.id;
    const readinessCase = await loadReadinessCase(tx, enrollmentId);
    const saved = (await loadFinalReviews(tx, [enrollmentId])).get(enrollmentId) ?? null;
    return asContract(finalReviewFormResponse, {
      engineer: { id: engineer.id, name: engineer.name },
      status: finalStatus(readinessCase !== null, saved),
      reached: readinessCase !== null,
      readinessCase,
      liveCalls: (await loadLiveCalls(tx, [enrollmentId])).get(enrollmentId) ?? [],
      saved,
    });
  }
}

@Roles("manager")
@Controller("manager")
export class ManagerFinalReviewController {
  constructor(private readonly finalReviews: ManagerFinalReviewService) {}

  @Get("final-reviews")
  list(@CurrentUser() user: Me): Promise<FinalReviewListResponse> {
    return this.finalReviews.list(user.id);
  }

  @Get("engineers/:id/final-review")
  form(
    @CurrentUser() user: Me,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
  ): Promise<FinalReviewFormResponse> {
    return this.finalReviews.form(user.id, params.id);
  }

  @Put("engineers/:id/final-review")
  save(
    @CurrentUser() user: Me,
    @Param(new ZodValidationPipe(idParam)) params: { id: string },
    @Body(new ZodValidationPipe(saveFinalReviewRequest)) body: SaveFinalReviewRequest,
  ): Promise<FinalReviewFormResponse> {
    return this.finalReviews.save(user.id, params.id, body);
  }
}
