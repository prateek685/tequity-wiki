import { Injectable } from "@nestjs/common";
import {
  type AssessmentResult,
  type AssessmentRules,
  type AssessmentStatus,
  type AssessmentViewResponse,
  assessmentViewResponse,
  QUESTION_TYPES,
} from "@portal/contracts";
import { z } from "zod";
import { dayRound, type Learner, lockAssessment, requireLearner } from "./learner.js";
import { ITEM_SELECT, quizItemView, storedQuestion } from "./quiz-items.js";
import { audit } from "../common/audit.js";
import { asContract } from "../common/contract.js";
import { DomainError } from "../common/domain-error.js";
import { assessmentPool } from "../content/lesson.js";
import { type Prisma } from "../generated/prisma/client.js";
import { PrismaService, type Tx } from "../prisma/prisma.service.js";
import {
  ASSESSMENT_CHOICE,
  ASSESSMENT_DEFAULTS,
  ASSESSMENT_QUESTIONS,
  ASSESSMENT_WRITTEN,
  assessmentPercent,
  assessmentStatus,
  type AttemptSummary,
  canRetake,
  canSupplyAssessment,
  pickAssessment,
  scoreAssessment,
} from "../rules/assessment.js";
import { ASSESSMENT_INTERVAL, hasAssessmentAfter } from "../rules/day-status.js";
import { effectiveRetakeAt } from "../rules/manager.js";

/**
 * Weekly assessment after Days 5, 10 … 60 (docs/PORTAL_PLAN.md "Assessment"). 8 multiple choice /
 * scenario + 2 written questions; pass = choice % ≥ `assessment.passPercent`; a failed attempt opens a
 * retake after `assessment.retakeHours`. Every query runs as the engineer through `withUser`.
 * A week reopened by a gate repeat takes its assessment again in the new round (attempts restart at 1;
 * the earlier round's attempts are kept and its questions are asked last).
 */

const ATTEMPT_SELECT = {
  id: true,
  day: true,
  round: true,
  attempt: true,
  completedAt: true,
  choiceCorrect: true,
  choiceTotal: true,
  passed: true,
  retakeAt: true,
} as const;

interface AttemptRow {
  id: string;
  day: number;
  round: number;
  attempt: number;
  completedAt: Date | null;
  choiceCorrect: number | null;
  choiceTotal: number | null;
  passed: boolean | null;
  retakeAt: Date | null;
}

const questionType = z.enum(QUESTION_TYPES);

/** Settings `assessment.passPercent` and `assessment.retakeHours`, with their defaults. */
export async function loadAssessmentRules(tx: Tx): Promise<AssessmentRules> {
  const rows = await tx.setting.findMany({
    where: { key: { in: ["assessment.passPercent", "assessment.retakeHours"] } },
    select: { key: true, value: true },
  });
  const int = (key: string, fallback: number, min: number, max: number): number => {
    const value = rows.find((row) => row.key === key)?.value;
    return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max
      ? value
      : fallback;
  };
  return {
    questions: ASSESSMENT_QUESTIONS,
    choiceQuestions: ASSESSMENT_CHOICE,
    writtenQuestions: ASSESSMENT_WRITTEN,
    passPercent: int("assessment.passPercent", ASSESSMENT_DEFAULTS.passPercent, 1, 100),
    retakeHours: int("assessment.retakeHours", ASSESSMENT_DEFAULTS.retakeHours, 0, 24 * 30),
  };
}

/** Days 1–5 for the Day-5 assessment, and so on. */
function weekDays(day: number): number[] {
  return Array.from({ length: ASSESSMENT_INTERVAL }, (_, i) => day - ASSESSMENT_INTERVAL + 1 + i);
}

/** `unlockedAt`: a manager's latest "retake now" for this assessment, which can open the retake early. */
function summary(row: AttemptRow, unlockedAt: Date | null): AttemptSummary {
  return {
    completed: row.completedAt !== null,
    passed: row.passed,
    retakeAt: effectiveRetakeAt(row.retakeAt, row.completedAt, unlockedAt),
  };
}

function resultOf(row: AttemptRow, unlockedAt: Date | null): AssessmentResult | null {
  if (!row.completedAt || row.choiceCorrect === null || row.choiceTotal === null || row.passed === null)
    return null;
  return {
    choiceCorrect: row.choiceCorrect,
    choiceTotal: row.choiceTotal,
    percent: assessmentPercent(row.choiceCorrect, row.choiceTotal),
    passed: row.passed,
    retakeAt: effectiveRetakeAt(row.retakeAt, row.completedAt, unlockedAt)?.toISOString() ?? null,
  };
}

/** The live questions of the assessment's pool (type read from the stored question). */
async function questionPool(tx: Tx, day: number) {
  const rows = await tx.question.findMany({
    where: { pool: assessmentPool(day), retired: false },
    select: { id: true, version: true, data: true },
  });
  return rows.map((row) => ({ ...row, type: storedQuestion({ questionData: row.data }).type }));
}

function statusOf(learner: Learner, day: number, attempts: readonly AttemptRow[], poolReady: boolean) {
  const latest = attempts[0] ?? null;
  const unlockedAt = learner.retakeUnlocks.get(day) ?? null;
  return assessmentStatus({
    weekDone: weekDays(day).every((d) => learner.doneDays.has(d)),
    unlockAll: learner.unlockAll,
    poolReady,
    attempts: attempts.map((row) => summary(row, unlockedAt)),
    latest: latest ? summary(latest, unlockedAt) : null,
  });
}

/**
 * Score a finished assessment attempt (its last item was just answered) and store the result once.
 * Only multiple choice and scenario count; written answers wait for AI scoring.
 */
export async function finishAssessment(tx: Tx, attemptId: string, now: Date): Promise<void> {
  const attempt = await tx.quizAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    select: {
      day: true,
      round: true,
      attempt: true,
      items: { select: { questionData: true, correct: true } },
    },
  });
  const choice = attempt.items.filter((item) => storedQuestion(item).type !== "written");
  const rules = await loadAssessmentRules(tx);
  const score = scoreAssessment({
    choiceCorrect: choice.filter((item) => item.correct === true).length,
    choiceTotal: choice.length,
    passPercent: rules.passPercent,
    retakeHours: rules.retakeHours,
    completedAt: now,
  });
  const updated = await tx.quizAttempt.updateMany({
    where: { id: attemptId, completedAt: null },
    data: {
      completedAt: now,
      choiceCorrect: score.choiceCorrect,
      choiceTotal: score.choiceTotal,
      passed: score.passed,
      retakeAt: score.retakeAt,
    },
  });
  if (updated.count === 0) return;
  await audit(tx, "assessment.completed", "quiz_attempt", attemptId, null, {
    day: attempt.day,
    round: attempt.round,
    attempt: attempt.attempt,
    percent: score.percent,
    passed: score.passed,
  });
}

/** Status of every assessment (day → status) for the course outline. */
export async function outlineAssessments(
  tx: Tx,
  learner: Learner | null,
): Promise<Map<number, AssessmentStatus>> {
  const days = Array.from({ length: 12 }, (_, i) => (i + 1) * ASSESSMENT_INTERVAL).filter(hasAssessmentAfter);
  if (!learner) return new Map(days.map((day) => [day, "locked" as const]));
  const attempts = await tx.quizAttempt.findMany({
    where: { enrollmentId: learner.enrollment.id, kind: "assessment" },
    orderBy: { attempt: "desc" },
    select: ATTEMPT_SELECT,
  });
  const pools = await tx.question.findMany({
    where: { retired: false, pool: { in: days.map(assessmentPool) } },
    select: { pool: true, type: true },
  });
  return new Map(
    days.map((day) => {
      const pool = pools
        .filter((q) => q.pool === assessmentPool(day))
        .map((q) => ({ id: q.pool, type: questionType.catch("mcq").parse(q.type) }));
      return [
        day,
        statusOf(
          learner,
          day,
          attempts.filter((a) => a.day === day && a.round === dayRound(learner, day)),
          canSupplyAssessment(pool),
        ),
      ];
    }),
  );
}

@Injectable()
export class AssessmentService {
  constructor(private readonly prisma: PrismaService) {}

  view(userId: string, day: number): Promise<AssessmentViewResponse> {
    return this.prisma.withUser(userId, async (tx) => {
      const learner = await requireLearner(tx, userId);
      return this.buildView(tx, learner, day, new Date());
    });
  }

  /** Resume the open attempt, or start attempt 1, or a retake once the wait is over. */
  start(userId: string, day: number): Promise<AssessmentViewResponse> {
    return this.prisma.withUser(userId, async (tx) => {
      const learner = await requireLearner(tx, userId);
      const enrollmentId = learner.enrollment.id;
      // Two quick "start" calls (a double click) must resume one attempt, not race to create two.
      await lockAssessment(tx, enrollmentId, day);
      const now = new Date();
      const round = dayRound(learner, day);
      const attempts = await this.attempts(tx, enrollmentId, day, round);
      const pool = await questionPool(tx, day);
      const poolReady = canSupplyAssessment(pool);
      const status = statusOf(learner, day, attempts, poolReady);
      if (status === "locked") throw new DomainError("ASSESSMENT_LOCKED");
      if (status === "in_progress" || status === "passed") return this.buildView(tx, learner, day, now);
      if (status === "not_ready") throw new DomainError("QUIZ_NOT_READY");
      const latest = attempts[0] ?? null;
      const unlockedAt = learner.retakeUnlocks.get(day) ?? null;
      if (
        status === "failed" &&
        !canRetake(status, latest ? summary(latest, unlockedAt) : null, poolReady, now)
      ) {
        throw new DomainError(poolReady ? "RETAKE_NOT_YET" : "QUIZ_NOT_READY");
      }

      // Questions asked in any round of this assessment come last.
      const asked = await tx.quizItem.findMany({
        where: { attempt: { enrollmentId, kind: "assessment", day } },
        select: { questionId: true },
      });
      const picked = pickAssessment(pool, new Set(asked.map((row) => row.questionId)));
      if (!picked) throw new DomainError("QUIZ_NOT_READY");
      const attempt = await tx.quizAttempt.create({
        data: {
          enrollmentId,
          userId,
          kind: "assessment",
          day,
          round,
          attempt: (latest?.attempt ?? 0) + 1,
        },
        select: { id: true },
      });
      await tx.quizItem.createMany({
        data: picked.map((q, position) => ({
          attemptId: attempt.id,
          userId,
          kind: "assessment" as const,
          position,
          questionId: q.id,
          questionVersion: q.version,
          questionData: q.data as Prisma.InputJsonValue,
          scoreStatus: q.type === "written" ? "pending" : "not_applicable",
        })),
      });
      return this.buildView(tx, learner, day, now);
    });
  }

  /** The assessment's attempts in one round, newest first. */
  private attempts(tx: Tx, enrollmentId: string, day: number, round: number): Promise<AttemptRow[]> {
    return tx.quizAttempt.findMany({
      where: { enrollmentId, kind: "assessment", day, round },
      orderBy: { attempt: "desc" },
      select: ATTEMPT_SELECT,
    });
  }

  private async buildView(tx: Tx, learner: Learner, day: number, now: Date): Promise<AssessmentViewResponse> {
    const attempts = await this.attempts(tx, learner.enrollment.id, day, dayRound(learner, day));
    const poolReady = canSupplyAssessment(await questionPool(tx, day));
    const status = statusOf(learner, day, attempts, poolReady);
    const latest = attempts[0] ?? null;
    const unlockedAt = learner.retakeUnlocks.get(day) ?? null;
    const rows = latest
      ? await tx.quizItem.findMany({
          where: { attemptId: latest.id },
          orderBy: { position: "asc" },
          select: ITEM_SELECT,
        })
      : [];
    const week = day / ASSESSMENT_INTERVAL;
    const block = await tx.contentBlock.findUnique({ where: { number: week }, select: { data: true } });
    const title = (block?.data as { title?: unknown } | undefined)?.title;
    return asContract(assessmentViewResponse, {
      day,
      week,
      weekTitle: typeof title === "string" ? title : "",
      status,
      canRetake: canRetake(status, latest ? summary(latest, unlockedAt) : null, poolReady, now),
      rules: await loadAssessmentRules(tx),
      attempt: latest
        ? {
            id: latest.id,
            number: latest.attempt,
            items: rows.map(quizItemView),
            completedAt: latest.completedAt?.toISOString() ?? null,
            result: resultOf(latest, unlockedAt),
          }
        : null,
      history: attempts.slice(1).flatMap((row) => {
        const result = resultOf(row, null);
        return row.completedAt && result
          ? [{ number: row.attempt, completedAt: row.completedAt.toISOString(), result }]
          : [];
      }),
      unlockAll: learner.unlockAll,
    });
  }
}
