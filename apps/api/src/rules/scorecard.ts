import {
  type Lesson,
  type Pillar,
  PILLARS,
  type PillarScores,
  type WeeklyScorecard,
} from "@portal/contracts";

/**
 * Progress scores (docs/PORTAL_PLAN.md §3 "Scoring", packages/contracts/src/progress.ts). Pure.
 * Pillar scores are averages of 1–5 behaviour ratings, rounded to 1 decimal.
 */

export interface BehaviourPillar {
  id: string;
  pillar: Pillar;
}

export const DAYS_PER_WEEK = 5;

export function roundOne(value: number): number {
  return Math.round(value * 10) / 10;
}

export function weekOf(day: number): number {
  return Math.ceil(day / DAYS_PER_WEEK);
}

export function emptyPillarScores(): PillarScores {
  return Object.fromEntries(PILLARS.map((pillar) => [pillar, null])) as PillarScores;
}

/** Pillars that have at least one of these behaviours, in pillar order. */
export function pillarsOf(behaviourIds: readonly string[], behaviours: readonly BehaviourPillar[]): Pillar[] {
  const wanted = new Set(behaviourIds);
  const found = new Set(behaviours.filter((b) => wanted.has(b.id)).map((b) => b.pillar));
  return PILLARS.filter((pillar) => found.has(pillar));
}

/** Per pillar: the average of its rated behaviours (1 decimal); null when none of them is rated. */
export function pillarAverages(
  ratings: Readonly<Record<string, number>>,
  behaviours: readonly BehaviourPillar[],
): PillarScores {
  const scores = emptyPillarScores();
  for (const pillar of PILLARS) {
    const values = behaviours
      .filter((b) => b.pillar === pillar)
      .flatMap((b) => (ratings[b.id] === undefined ? [] : [ratings[b.id] as number]));
    if (values.length > 0) scores[pillar] = roundOne(values.reduce((a, b) => a + b, 0) / values.length);
  }
  return scores;
}

/** Only the rated pillars (what the `scorecards.pillar_scores` column stores). */
export function ratedPillarScores(scores: PillarScores): Partial<Record<Pillar, number>> {
  return Object.fromEntries(PILLARS.flatMap((p) => (scores[p] === null ? [] : [[p, scores[p]]])));
}

export interface StoredScorecard {
  week: number;
  day: number;
  /** Rated pillars only. */
  pillarScores: Partial<Record<Pillar, number | null>>;
  daysCompleted: number;
  mocksDone: number;
}

/**
 * The scorecard chart: in week order, a pillar not rated that week carries forward its latest score
 * (an earlier scorecard, else the Day-1 baseline). `now` = the latest per pillar (else the baseline).
 */
export function scorecardSeries(
  cards: readonly StoredScorecard[],
  dayOne: PillarScores | null,
): { scorecards: WeeklyScorecard[]; now: PillarScores } {
  const latest: PillarScores = dayOne ? { ...dayOne } : emptyPillarScores();
  const scorecards = [...cards]
    .sort((a, b) => a.week - b.week)
    .map((card) => {
      const rated = PILLARS.filter((p) => typeof card.pillarScores[p] === "number");
      for (const pillar of rated) latest[pillar] = card.pillarScores[pillar] ?? null;
      return {
        week: card.week,
        day: card.day,
        scores: { ...latest },
        rated,
        daysCompleted: card.daysCompleted,
        mocksDone: card.mocksDone,
      };
    });
  return { scorecards, now: latest };
}

export interface RubricRow {
  criterion: number;
  score: number | null;
  source: string;
}

/** Call rubric averages per criterion 1–11: mock self-scores for 1–10, gates for 11 (n/a skipped). */
export function rubricAverages(
  rows: readonly RubricRow[],
): { criterion: number; average: number | null; count: number }[] {
  return Array.from({ length: 11 }, (_, index) => {
    const criterion = index + 1;
    const source = criterion === 11 ? "gate" : "mock_self";
    const scores = rows.flatMap((row) =>
      row.criterion === criterion && row.source === source && row.score !== null ? [row.score] : [],
    );
    return {
      criterion,
      average: scores.length ? roundOne(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      count: scores.length,
    };
  });
}

/** A lesson that holds the Friday scorecard. */
export function isScorecardLesson(lesson: Pick<Lesson, "kind" | "scorecard">): boolean {
  return lesson.kind === "scorecard" || lesson.scorecard.length > 0;
}

export interface WeekDay {
  lessons: readonly Pick<Lesson, "id" | "kind" | "scorecard">[];
  doneIds: ReadonlySet<string>;
  /** The day is completed (lessons and quiz). */
  completed: boolean;
}

/**
 * Days completed and mock lessons saved in a week. A day with the scorecard lesson counts once all
 * its other lessons are done (the scorecard is filled in before the day's quiz).
 */
export function weekStats(days: readonly WeekDay[]): { daysCompleted: number; mocksDone: number } {
  let daysCompleted = 0;
  let mocksDone = 0;
  for (const day of days) {
    const hasScorecard = day.lessons.some(isScorecardLesson);
    const othersDone = day.lessons
      .filter((lesson) => !isScorecardLesson(lesson))
      .every((lesson) => day.doneIds.has(lesson.id));
    if (day.completed || (hasScorecard && othersDone)) daysCompleted++;
    mocksDone += day.lessons.filter((lesson) => lesson.kind === "mock" && day.doneIds.has(lesson.id)).length;
  }
  return { daysCompleted: Math.min(daysCompleted, DAYS_PER_WEEK), mocksDone };
}
