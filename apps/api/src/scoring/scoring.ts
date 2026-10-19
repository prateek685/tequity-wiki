import {
  type AiScore,
  AI_SCORE_STATUSES,
  type Lesson,
  POINT_VERDICTS,
  type Question,
  type QuizItemResult,
} from "@portal/contracts";
import { type JobsOptions } from "bullmq";
import { z } from "zod";

/**
 * AI scoring of written answers (docs/M2_SPEC.md "AI scoring"): the pure parts shared by the API (which
 * saves `pending` rows and queues them) and the worker (which scores them).
 */

/** What a scoring job carries: ids only, never answer text. */
export const scoreRef = z.object({
  aiScoreId: z.uuid(),
  userId: z.uuid(),
  revision: z.number().int().min(1),
});
export type ScoreRef = z.infer<typeof scoreRef>;

/** One job per row and revision. BullMQ forbids ':' in custom job ids. */
export function scoreJobId(ref: Pick<ScoreRef, "aiScoreId" | "revision">): string {
  return `score-${ref.aiScoreId}-${ref.revision}`;
}

/** 3 attempts with backoff (30 s, 60 s); finished jobs are removed so the sweep can queue a row again. */
export const SCORE_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 30_000 },
  removeOnComplete: true,
  removeOnFail: true,
};

/** A modest cap, so a burst of answers (a whole team on the same Friday) doesn't hit the API's rate limit. */
export const SCORING_LIMITER = { max: 15, duration: 60_000 };

/** The sweep runs every 10 minutes and re-queues rows pending for longer than 10 minutes. */
export const SWEEP_EVERY_MS = 10 * 60_000;
export const SWEEP_OLDER_THAN = "10 minutes";

/** `content_days.write_scoring`: lesson id → the model answer and 2–3 scoring points. Server only. */
export const writeScoringGuides = z.record(
  z.string(),
  z.object({ modelAnswer: z.string(), scoringPoints: z.array(z.string().min(1)).min(1) }),
);
export type WriteScoringGuide = z.infer<typeof writeScoringGuides>[string];

/** The day's scoring guides (an empty map when the day has none or the column is malformed). */
export function parseGuides(value: unknown): Map<string, WriteScoringGuide> {
  const parsed = writeScoringGuides.safeParse(value ?? {});
  return new Map(parsed.success ? Object.entries(parsed.data) : []);
}

/**
 * A write lesson's answer as the scorer sees it: each non-empty field as "<label>:\n<value>", in the
 * lesson's field order, separated by a blank line. Empty when nothing was written.
 */
export function writeAnswerText(lesson: Pick<Lesson, "fields">, values: Record<string, string>): string {
  return lesson.fields
    .flatMap((field) => {
      const value = values[field.id]?.trim() ?? "";
      return value ? [`${field.label}:\n${value}`] : [];
    })
    .join("\n\n");
}

/** A write lesson's task for the scorer: its heading, lead and what each field asks for. */
export function writeTask(lesson: Pick<Lesson, "title" | "heading" | "lead" | "fields">): string {
  const fields = lesson.fields.map((field) => `- ${field.label}`).join("\n");
  return [lesson.heading ?? lesson.title, lesson.lead ?? "", fields ? `Fields:\n${fields}` : ""]
    .filter(Boolean)
    .join("\n\n");
}

/** A written question's task for the scorer: the question, and what the client says (scenarios). */
export function quizTask(q: Pick<Question, "stem" | "clientLine">): string {
  return q.clientLine ? `${q.stem}\n\nThe client says: "${q.clientLine}"` : q.stem;
}

/** Real-project answers aren't sent to the model while `ai.scoreRealProjectAnswers` is off (§7.1). */
export function isRealProjectAnswer(lesson: Pick<Lesson, "source">, realProject: boolean): boolean {
  return lesson.source !== "carebook" && realProject;
}

// ── Rows → contract ─────────────────────────────────────────────────────────────────────────────

/** The ai_scores columns `toAiScore` needs. */
export const AI_SCORE_SELECT = {
  status: true,
  score: true,
  points: true,
  reason: true,
  betterSentence: true,
  possiblePhi: true,
  scoredAt: true,
} as const;

export interface AiScoreRow {
  status: string;
  score: number | null;
  points: unknown;
  reason: string | null;
  betterSentence: string | null;
  possiblePhi: boolean;
  scoredAt: Date | null;
}

const storedPoints = z.array(z.object({ point: z.string(), verdict: z.enum(POINT_VERDICTS) }));

export function toAiScore(row: AiScoreRow): AiScore {
  const status = z.enum(AI_SCORE_STATUSES).catch("pending").parse(row.status);
  const points = storedPoints.safeParse(row.points);
  return {
    status,
    score: row.score,
    points: points.success ? points.data : [],
    reason: row.reason,
    betterSentence: row.betterSentence,
    possiblePhi: row.possiblePhi,
    scoredAt: row.scoredAt?.toISOString() ?? null,
  };
}

/** `quizItemResult.scoreStatus` (kept for older clients): the AI score's status; not_scored → failed. */
export function legacyScoreStatus(score: AiScore): QuizItemResult["scoreStatus"] {
  return score.status === "not_scored" ? "failed" : score.status;
}
