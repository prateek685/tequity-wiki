import { z } from "zod";
import { isoDate } from "./common.js";
import { PILLARS } from "./content.js";
import { FINAL_OUTCOMES } from "./final-review.js";
import { PACE_STATUSES } from "./learning.js";

/**
 * Progress and Journal (docs/PORTAL_PLAN.md §3 "Scoring", final mockup "Progress" / "Journal").
 *
 * Friday scorecard: the engineer rates only the week's target behaviours (the scorecard lesson's
 * `scorecard` list); a pillar's score for that week = the average of its rated behaviours. A pillar not
 * rated that week carries forward its latest score (an earlier week, else the Day-1 baseline) and is
 * marked `carried`. The scorecard lesson also saves, in its entry `values`: `proof-<pillar>` (one per
 * rated pillar, required), `win` and `stuck` (optional). Days completed and mocks done are filled in by
 * the portal.
 */

export const pillarScores = z.object(
  Object.fromEntries(PILLARS.map((pillar) => [pillar, z.number().min(1).max(5).nullable()])) as Record<
    (typeof PILLARS)[number],
    z.ZodNullable<z.ZodNumber>
  >,
);
export type PillarScores = z.infer<typeof pillarScores>;

/**
 * Scorecard field ids saved in the scorecard lesson's entry `values`. Field ids allow only `a-z0-9-`,
 * so the pillar's underscore becomes a hyphen ("proof-stand-firm").
 */
export const SCORECARD_FIELDS = {
  proof: (pillar: string) => `proof-${pillar.replaceAll("_", "-")}`,
  win: "win",
  stuck: "stuck",
} as const;

export const weeklyScorecard = z.object({
  week: z.number().int().min(1).max(13),
  /** The 5th day of the week (5, 10 …). */
  day: z.number().int(),
  /** Per pillar: the score shown on the chart (rated this week, or carried forward). */
  scores: pillarScores,
  /** Pillars rated this week (the others are carried forward). */
  rated: z.array(z.enum(PILLARS)),
  daysCompleted: z.number().int().min(0).max(5),
  mocksDone: z.number().int().min(0),
});
export type WeeklyScorecard = z.infer<typeof weeklyScorecard>;

/** GET /api/me/progress — the engineer's Progress page. */
export const progressResponse = z.object({
  days: z.object({
    done: z.number().int(),
    total: z.number().int(),
    pace: z.enum(PACE_STATUSES).nullable(),
    targetDate: isoDate.nullable(),
  }),
  assessments: z.object({
    passed: z.number().int(),
    /** Assessments taken at least once. */
    taken: z.number().int(),
    /** Average best % across taken assessments, null before the first. */
    averagePercent: z.number().int().nullable(),
  }),
  /** Gate 1 result: null until gates are built and recorded. */
  gate1: z.object({ average: z.number(), lowest: z.number().int(), passed: z.boolean() }).nullable(),
  /** AI average of the last 10 scored write lessons (1–5, 1 decimal); null before the first score. */
  writing: z.object({ average: z.number(), count: z.number().int() }).nullable(),
  /** One entry per submitted Friday scorecard, in week order. */
  scorecards: z.array(weeklyScorecard),
  /** Day-1 baseline averaged per pillar (null before it's saved), and the latest per pillar. */
  dayOne: pillarScores.nullable(),
  now: pillarScores,
  /** Day 90: the final scorecard (Day 65, all 14 behaviours) per pillar, null before it's saved. */
  dayNinety: pillarScores.nullable().default(null),
  /** The final review decision, null until the manager records it. */
  finalReview: z
    .object({ outcome: z.enum(FINAL_OUTCOMES), average: z.number().nullable() })
    .nullable()
    .default(null),
  /** Call rubric averages per criterion 1–11 (mock logs for 1–10, gates later for 11); null = no scores yet. */
  rubric: z.array(
    z.object({
      criterion: z.number().int().min(1).max(11),
      average: z.number().nullable(),
      count: z.number().int(),
    }),
  ),
});
export type ProgressResponse = z.infer<typeof progressResponse>;

/** One journal line: a saved text answer from a lesson. */
export const journalEntry = z.object({
  day: z.number().int(),
  storyDate: z.string(),
  lessonId: z.string(),
  lessonTitle: z.string(),
  /** The field's label, e.g. "What went well", "Your rewrite of message 1". */
  label: z.string(),
  text: z.string(),
  savedAt: z.string(),
});
export type JournalEntry = z.infer<typeof journalEntry>;

/** GET /api/me/journal — everything the engineer wrote, newest day first. Private to the engineer. */
export const journalResponse = z.object({ entries: z.array(journalEntry) });
export type JournalResponse = z.infer<typeof journalResponse>;

/** One line in the Home "Latest feedback" card, newest first. */
export const FEEDBACK_KINDS = ["mock", "quiz", "assessment", "write"] as const;
export const feedbackItem = z.object({
  kind: z.enum(FEEDBACK_KINDS),
  day: z.number().int(),
  /** e.g. "Day 2 · Rapid-fire status questions", "Day 2 · Daily quiz", "Week 1 assessment". */
  title: z.string(),
  /**
   * mock: "Fix next time: …" (the reflect lesson's fix-next field) · quiz/assessment: "Multiple choice" ·
   * write: the AI's better sentence, or "Being scored…".
   */
  detail: z.string(),
  /** mock: rubric average "2.8" · quiz/assessment: "3/4" · write: "4/5"; null while pending. */
  value: z.string().nullable(),
  /** Where the row links to (an app path). */
  href: z.string(),
  at: z.string(),
});
export type FeedbackItem = z.infer<typeof feedbackItem>;

/** GET /api/me/home — the Home cards that aren't covered by /me/plan and /me/days/:day. */
export const homeResponse = z.object({
  /** Day-1 baseline averaged per pillar, null before it's saved. */
  baseline: pillarScores.nullable(),
  /** Up to 4 items, newest first. */
  feedback: z.array(feedbackItem).max(4),
});
export type HomeResponse = z.infer<typeof homeResponse>;
