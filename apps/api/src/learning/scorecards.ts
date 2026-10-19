import {
  type LessonEntry,
  PILLARS,
  type PillarScores,
  type ReadinessModel,
  SCORECARD_FIELDS,
} from "@portal/contracts";
import { z } from "zod";
import { type Learner } from "./learner.js";
import { loadDayLessons, storedDay } from "../content/lesson.js";
import { type Prisma } from "../generated/prisma/client.js";
import { type Tx } from "../prisma/prisma.service.js";
import {
  DAYS_PER_WEEK,
  pillarAverages,
  pillarsOf,
  ratedPillarScores,
  type StoredScorecard,
  weekOf,
  weekStats,
} from "../rules/scorecard.js";

/** Friday scorecard storage (score #5): the `scorecards` table and the week's auto-filled numbers. */

/** This week's days completed and mock lessons saved in the week's round (see `weekStats`). */
export async function loadWeekStats(
  tx: Tx,
  enrollmentId: string,
  week: number,
  round: number,
): Promise<{ daysCompleted: number; mocksDone: number }> {
  const range = { gte: (week - 1) * DAYS_PER_WEEK + 1, lte: week * DAYS_PER_WEEK };
  const content = await tx.contentDay.findMany({ where: { day: range }, select: { day: true, data: true } });
  const entries = await tx.stepEntry.findMany({
    where: { enrollmentId, day: range, round },
    select: { day: true, lessonId: true },
  });
  const completed = await tx.dayProgress.findMany({
    where: { enrollmentId, day: range, round, completedAt: { not: null } },
    select: { day: true },
  });
  const days = Array.from({ length: DAYS_PER_WEEK }, (_, i) => range.gte + i).map((day) => {
    const row = content.find((c) => c.day === day);
    return {
      lessons: row ? storedDay.parse(row.data).lessons : [],
      doneIds: new Set(entries.filter((e) => e.day === day).map((e) => e.lessonId)),
      completed: completed.some((c) => c.day === day),
    };
  });
  return weekStats(days);
}

/** Save (or update) the week's scorecard row (in the week's round) from the scorecard lesson's entry. */
export async function saveScorecard(
  tx: Tx,
  learner: Learner,
  day: number,
  round: number,
  entry: LessonEntry,
  model: ReadinessModel,
): Promise<void> {
  const enrollmentId = learner.enrollment.id;
  const week = weekOf(day);
  const stats = await loadWeekStats(tx, enrollmentId, week, round);
  const rated = pillarsOf(Object.keys(entry.ratings), model.behaviours);
  const proof = Object.fromEntries(
    rated.map((pillar) => [pillar, entry.values[SCORECARD_FIELDS.proof(pillar)]?.trim() ?? ""]),
  );
  const text = (id: string) => entry.values[id]?.trim() || null;
  const data = {
    day,
    ratings: entry.ratings as Prisma.InputJsonObject,
    pillarScores: ratedPillarScores(pillarAverages(entry.ratings, model.behaviours)),
    proof,
    win: text(SCORECARD_FIELDS.win),
    stuck: text(SCORECARD_FIELDS.stuck),
    daysCompleted: stats.daysCompleted,
    mocksDone: stats.mocksDone,
  };
  await tx.scorecard.upsert({
    where: { enrollmentId_week_round: { enrollmentId, week, round } },
    create: { enrollmentId, userId: learner.userId, week, round, ...data },
    update: { ...data, updatedAt: new Date() },
  });
}

const storedPillarScores = z.partialRecord(z.enum(PILLARS), z.number().nullable());

/** The engineer's scorecards in week order: per week, the latest round's (a repeated week's new one). */
export async function loadScorecards(tx: Tx, enrollmentId: string): Promise<StoredScorecard[]> {
  const rows = await tx.scorecard.findMany({
    where: { enrollmentId },
    orderBy: [{ week: "asc" }, { round: "desc" }],
    distinct: ["week"],
    select: { week: true, day: true, pillarScores: true, daysCompleted: true, mocksDone: true },
  });
  return rows.map((row) => ({ ...row, pillarScores: storedPillarScores.parse(row.pillarScores) }));
}

/** Several engineers' scorecards (enrollment id → scorecards, as `loadScorecards`), in one query. */
export async function loadAllScorecards(
  tx: Tx,
  enrollmentIds: readonly string[],
): Promise<Map<string, StoredScorecard[]>> {
  const all = new Map<string, StoredScorecard[]>(enrollmentIds.map((id) => [id, []]));
  if (enrollmentIds.length === 0) return all;
  const rows = await tx.scorecard.findMany({
    where: { enrollmentId: { in: [...enrollmentIds] } },
    orderBy: [{ week: "asc" }, { round: "desc" }],
    select: {
      enrollmentId: true,
      week: true,
      day: true,
      pillarScores: true,
      daysCompleted: true,
      mocksDone: true,
    },
  });
  const seen = new Set<string>();
  for (const { enrollmentId, ...row } of rows) {
    // Per week, the latest round's.
    const key = `${enrollmentId}:${row.week}`;
    if (seen.has(key)) continue;
    seen.add(key);
    all.get(enrollmentId)?.push({ ...row, pillarScores: storedPillarScores.parse(row.pillarScores) });
  }
  return all;
}

/**
 * The Day-1 baseline ratings (the rate lesson with `baseline: true`), or null before it's saved. Read
 * through `app.baseline_ratings()` (numbers only), which serves the engineer and their managers alike:
 * managers can't read lesson entries.
 */
export async function loadBaselineRatings(
  tx: Tx,
  enrollmentId: string,
): Promise<Record<string, number> | null> {
  const lessons = (await loadDayLessons(tx, 1)) ?? [];
  const rate = lessons.find((item) => item.baseline);
  if (!rate) return null;
  const rows = await tx.$queryRaw<{ behaviour: string; rating: number }[]>`
    SELECT behaviour, rating FROM app.baseline_ratings(${enrollmentId}::uuid, ${rate.id})`;
  return rows.length > 0 ? Object.fromEntries(rows.map((row) => [row.behaviour, row.rating])) : null;
}

/**
 * Several engineers' Day-1 baseline ratings (enrollment id → ratings or null), in one call of
 * `app.baseline_ratings()` per enrollment inside a single query (the same function, the same access rules).
 */
export async function loadAllBaselineRatings(
  tx: Tx,
  enrollmentIds: readonly string[],
): Promise<Map<string, Record<string, number> | null>> {
  const all = new Map<string, Record<string, number> | null>(enrollmentIds.map((id) => [id, null]));
  if (enrollmentIds.length === 0) return all;
  const lessons = (await loadDayLessons(tx, 1)) ?? [];
  const rate = lessons.find((item) => item.baseline);
  if (!rate) return all;
  const rows = await tx.$queryRaw<{ enrollment_id: string; behaviour: string; rating: number }[]>`
    SELECT e.id::text AS enrollment_id, b.behaviour, b.rating
      FROM unnest(${[...enrollmentIds]}::uuid[]) AS e(id)
      CROSS JOIN LATERAL app.baseline_ratings(e.id, ${rate.id}) AS b`;
  for (const row of rows) {
    const ratings = all.get(row.enrollment_id) ?? {};
    ratings[row.behaviour] = row.rating;
    all.set(row.enrollment_id, ratings);
  }
  return all;
}

/** The Day-1 baseline averaged per pillar, or null. */
export function baselinePillars(
  ratings: Record<string, number> | null,
  model: ReadinessModel | null,
): PillarScores | null {
  return ratings && model ? pillarAverages(ratings, model.behaviours) : null;
}
