import {
  type JournalEntry,
  type PaceStatus,
  type Pillar,
  PILLARS,
  type PillarScores,
  type ProgressResponse,
  type WeeklyScorecard,
} from "@portal/contracts";
import { formatDate } from "@/lib/dates";

/**
 * Progress and Journal pages (docs/design/final-mockup.html `progress()` / `journal()`). Pure: unit-tested.
 * The progress response carries numbers only, so the names of the pillars and rubric criteria
 * (content/plan.yaml) are kept here.
 */

export const PILLAR_NAMES: Record<Pillar, string> = {
  understand: "Understand",
  communicate: "Communicate",
  own: "Own",
  stand_firm: "Stand firm",
};

export const RUBRIC_NAMES: Record<number, string> = {
  1: "Opening and agenda",
  2: "Answer-first structure",
  3: "Questions asked",
  4: "Playback",
  5: "Business link",
  6: "Trade-offs",
  7: "Handling unknowns",
  8: "Risks and bad news",
  9: "Disagreement",
  10: "Closing and next steps",
  11: "Written follow-up",
};

/** A 1–5 score with one decimal ("3.5"), or "—" when there is none. */
export function scoreText(score: number | null | undefined): string {
  return score === null || score === undefined ? "—" : score.toFixed(1);
}

// ── KPI tiles ─────────────────────────────────────────────────────────────────────────────────

const PACE_TEXT: Record<PaceStatus, string> = {
  not_started: "Not started yet",
  ahead: "Ahead of pace",
  on_pace: "On pace",
  behind: "Behind pace",
};

/** "On pace · finish by 2 Feb 2027" (either part may be missing). */
export function paceLine(days: ProgressResponse["days"]): string {
  const parts = [
    days.pace ? PACE_TEXT[days.pace] : null,
    days.targetDate ? `finish by ${formatDate(days.targetDate)}` : null,
  ].filter((part) => part !== null);
  const line = parts.join(" · ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/** The Assessments tile: "4 / 5" and "Passed · avg 74%"; before the first one, "—" and when it comes. */
export function assessmentTile(assessments: ProgressResponse["assessments"]): { value: string; sub: string } {
  if (assessments.taken === 0) return { value: "—", sub: "First one after Day 5" };
  const average = assessments.averagePercent === null ? "" : ` · avg ${assessments.averagePercent}%`;
  const open = assessments.taken - assessments.passed;
  const state = open === 0 ? "Passed" : `${open} to pass`;
  return { value: `${assessments.passed} / ${assessments.taken}`, sub: `${state}${average}` };
}

/** Writing tile: the AI average of the last 10 scored write tasks ("3.8" of 5), or "—" before the first. */
export function writingTile(
  writing: ProgressResponse["writing"],
  self = true,
): { value: string | null; sub: string } {
  if (!writing) return { value: null, sub: `After ${self ? "your" : "the"} first scored write task` };
  return {
    value: writing.average.toFixed(1),
    sub: `AI average · from ${writing.count} write ${writing.count === 1 ? "task" : "tasks"}`,
  };
}

// ── Pillar chart ──────────────────────────────────────────────────────────────────────────────

export const CHART = { width: 560, height: 200, left: 28, right: 12, top: 10, bottom: 26 } as const;
/** Phones draw a narrower chart so the 12px labels stay readable. */
export const NARROW_WIDTH = 340;
/** At least this many weeks on the x axis, so one or two scorecards don't stretch across the chart. */
export const MIN_WEEKS = 5;
export const MAX_WEEKS = 13;

/** "Days 1–5" for week 1, then "6–10", "11–15" … */
export function weekLabel(week: number): string {
  const first = (week - 1) * 5 + 1;
  const range = `${first}–${first + 4}`;
  return week === 1 ? `Days ${range}` : range;
}

/** Weeks shown on the x axis: up to the latest scorecard, at least MIN_WEEKS. */
export function chartWeeks(scorecards: Pick<WeeklyScorecard, "week">[]): number {
  const latest = Math.max(0, ...scorecards.map((card) => card.week));
  return Math.min(MAX_WEEKS, Math.max(MIN_WEEKS, latest));
}

/** Week (1-based) → x, score 1–5 → y, in the chart's viewBox. */
export function chartScale(weeks: number, width: number = CHART.width) {
  const span = width - CHART.left - CHART.right;
  const height = CHART.height - CHART.top - CHART.bottom;
  return {
    x: (week: number) => CHART.left + ((week - 1) * span) / Math.max(1, weeks - 1),
    y: (score: number) => CHART.top + ((5 - score) * height) / 4,
  };
}

/** Which x-axis labels to draw: all of them, or every other (every third) one when they'd crowd. */
export function axisWeeks(weeks: number, width: number = CHART.width): number[] {
  const all = Array.from({ length: weeks }, (_, index) => index + 1);
  const fits = Math.floor(width / 70);
  const step = Math.ceil(weeks / fits);
  return all.filter((week) => (week - 1) % step === 0);
}

export interface ChartPoint {
  week: number;
  score: number;
  x: number;
  y: number;
  /** Not rated that week: the last score carried forward (drawn hollow). */
  carried: boolean;
}

export interface ChartSegment {
  from: ChartPoint;
  to: ChartPoint;
  /** Leads into a carried-forward point (drawn dashed). */
  dashed: boolean;
}

export interface ChartSeries {
  pillar: Pillar;
  points: ChartPoint[];
  segments: ChartSegment[];
}

/**
 * One line per pillar. Lines are nudged apart by a pixel or two (as in the mockup) so equal scores
 * stay visible; a pillar with no score yet has no points.
 */
export function pillarSeries(
  scorecards: WeeklyScorecard[],
  weeks: number,
  width: number = CHART.width,
): ChartSeries[] {
  const { x, y } = chartScale(weeks, width);
  const ordered = [...scorecards].sort((a, b) => a.week - b.week);
  return PILLARS.map((pillar, index) => {
    const offset = (index - 1.5) * 1.6;
    const points = ordered.flatMap((card): ChartPoint[] => {
      const score = card.scores[pillar];
      if (score === null || card.week > weeks) return [];
      return [
        {
          week: card.week,
          score,
          x: x(card.week),
          y: y(score) + offset,
          carried: !card.rated.includes(pillar),
        },
      ];
    });
    const segments = points.slice(1).map((to, at) => {
      const from = points[at] as ChartPoint;
      return { from, to, dashed: to.carried };
    });
    return { pillar, points, segments };
  });
}

/** Day 1 → now rows, in pillar order. */
export function dayOneRows(
  dayOne: PillarScores | null,
  now: PillarScores,
): { pillar: Pillar; name: string; dayOne: string; now: string }[] {
  return PILLARS.map((pillar) => ({
    pillar,
    name: PILLAR_NAMES[pillar],
    dayOne: scoreText(dayOne?.[pillar]),
    now: scoreText(now[pillar]),
  }));
}

/** The rubric bar's fill: 1–5 → 20–100 %, 0 when there's no score. */
export function rubricPercent(average: number | null): number {
  if (average === null) return 0;
  return Math.round(Math.min(5, Math.max(0, average)) * 20);
}

// ── Journal ───────────────────────────────────────────────────────────────────────────────────

export interface JournalDay {
  day: number;
  storyDate: string;
  entries: JournalEntry[];
}

/** Entries grouped by day, newest day first; a day keeps the API's order (lesson order). */
export function journalDays(entries: JournalEntry[]): JournalDay[] {
  const byDay = new Map<number, JournalDay>();
  for (const entry of entries) {
    const group = byDay.get(entry.day) ?? { day: entry.day, storyDate: entry.storyDate, entries: [] };
    group.entries.push(entry);
    byDay.set(entry.day, group);
  }
  return [...byDay.values()].sort((a, b) => b.day - a.day);
}
