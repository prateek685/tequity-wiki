import { type FinalOutcome, type ProgressResponse, progressResponse } from "@portal/contracts";
import { type Learner, loadPace } from "./learner.js";
import { loadFinalReviews } from "./phase3.js";
import { baselinePillars, loadBaselineRatings, loadScorecards } from "./scorecards.js";
import { asContract } from "../common/contract.js";
import { loadReadinessModel } from "../content/lesson.js";
import { type Tx } from "../prisma/prisma.service.js";
import { assessmentPercent } from "../rules/assessment.js";
import { TOTAL_DAYS } from "../rules/day-status.js";
import { WRITING_WINDOW, writingAverage } from "../rules/feedback.js";
import { emptyPillarScores, rubricAverages, scorecardSeries } from "../rules/scorecard.js";

/**
 * The Progress page numbers (GET /me/progress, and `progress` on the manager's engineer detail). One
 * builder for both callers: it reads only what a manager of the engineer may read too (completion,
 * attempts, scorecards, rubric scores, gate results) and numbers from private tables through SECURITY DEFINER
 * functions (`app.baseline_ratings`, `app.write_scores`). It never reads lesson entries or AI feedback
 * text, so the same result comes back whoever asks.
 */
export async function buildProgress(tx: Tx, learner: Learner | null): Promise<ProgressResponse> {
  if (!learner) {
    return asContract(progressResponse, {
      days: { done: 0, total: TOTAL_DAYS, pace: null, targetDate: null },
      assessments: { passed: 0, taken: 0, averagePercent: null },
      gate1: null,
      writing: null,
      scorecards: [],
      dayOne: null,
      now: emptyPillarScores(),
      rubric: rubricAverages([]),
    });
  }
  const enrollmentId = learner.enrollment.id;
  const pace = await loadPace(tx, learner);
  const model = await loadReadinessModel(tx);
  const dayOne = baselinePillars(await loadBaselineRatings(tx, enrollmentId), model);
  const { scorecards, now } = scorecardSeries(await loadScorecards(tx, enrollmentId), dayOne);
  const rubricRows = await tx.rubricScore.findMany({
    where: { enrollmentId },
    select: { criterion: true, score: true, source: true },
  });
  return asContract(progressResponse, {
    days: {
      done: learner.completedDays.size,
      total: TOTAL_DAYS,
      pace: pace.status,
      targetDate: learner.enrollment.targetDate,
    },
    assessments: await assessmentSummary(tx, enrollmentId),
    gate1: await gate1(tx, enrollmentId),
    writing: await writing(tx, enrollmentId),
    scorecards,
    dayOne,
    now,
    // Day 90: the final scorecard (Week 13, rated on Day 65).
    dayNinety: scorecards.find((card) => card.week === LAST_WEEK)?.scores ?? null,
    finalReview: finalOf((await loadFinalReviews(tx, [enrollmentId])).get(enrollmentId)),
    rubric: rubricAverages(rubricRows),
  });
}

const LAST_WEEK = 13;

function finalOf(result: { outcome: FinalOutcome; average: number | null } | undefined) {
  return result ? { outcome: result.outcome, average: result.average } : null;
}

/** The latest recorded Gate 1 round: its average, lowest criterion and whether it passed. */
async function gate1(tx: Tx, enrollmentId: string): Promise<ProgressResponse["gate1"]> {
  const row = await tx.gateResult.findFirst({
    where: { enrollmentId, gate: 1 },
    orderBy: { round: "desc" },
    select: { average: true, lowest: true, outcome: true },
  });
  if (!row || row.average === null || row.lowest === null) return null;
  return { average: row.average, lowest: row.lowest, passed: row.outcome !== "repeat" };
}

/** AI average of the last 10 scored write lessons (scores only, via `app.write_scores`). */
async function writing(tx: Tx, enrollmentId: string): Promise<ProgressResponse["writing"]> {
  const rows = await tx.$queryRaw<{ score: number }[]>`
    SELECT score FROM app.write_scores(${enrollmentId}::uuid, ${WRITING_WINDOW}::int)`;
  return writingAverage(rows.map((row) => row.score));
}

/** Assessments taken (finished at least once), passed, and the average of each one's best percent. */
async function assessmentSummary(tx: Tx, enrollmentId: string): Promise<ProgressResponse["assessments"]> {
  const attempts = await tx.quizAttempt.findMany({
    where: { enrollmentId, kind: "assessment", completedAt: { not: null } },
    select: { day: true, choiceCorrect: true, choiceTotal: true, passed: true },
  });
  const best = new Map<number, number>();
  const passed = new Set<number>();
  for (const attempt of attempts) {
    const percent = assessmentPercent(attempt.choiceCorrect ?? 0, attempt.choiceTotal ?? 0);
    best.set(attempt.day, Math.max(best.get(attempt.day) ?? 0, percent));
    if (attempt.passed) passed.add(attempt.day);
  }
  const percents = [...best.values()];
  return {
    passed: passed.size,
    taken: best.size,
    averagePercent: percents.length
      ? Math.floor(percents.reduce((a, b) => a + b, 0) / percents.length)
      : null,
  };
}
