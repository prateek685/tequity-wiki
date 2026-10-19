import { z } from "zod";

/**
 * AI scoring of written answers (docs/M2_SPEC.md, PORTAL_PLAN §7): written daily-quiz and assessment
 * answers, and write lessons that have a scoring guide. The answer is saved first (status `pending`) and
 * scored in the background; progress never waits for it. The feedback text is private to the engineer.
 *
 * pending: waiting for the scorer · scored · failed: gave up after the retries ·
 * not_scored: a real-project answer while `ai.scoreRealProjectAnswers` is off.
 */
export const AI_SCORE_STATUSES = ["pending", "scored", "failed", "not_scored"] as const;
export type AiScoreStatus = (typeof AI_SCORE_STATUSES)[number];

export const POINT_VERDICTS = ["met", "partly", "not_met"] as const;
export type PointVerdict = (typeof POINT_VERDICTS)[number];

/** The scorer's result, also the structured output asked from the model (validated, then checked for consistency). */
export const scoreResult = z.object({
  /** One per scoring point, in the guide's order. */
  points: z.array(z.object({ point: z.string(), verdict: z.enum(POINT_VERDICTS) })).min(1),
  score: z.number().int().min(1).max(5),
  /** 1–2 sentences. */
  reason: z.string().min(1).max(600),
  /** One sentence from the answer, rewritten better. */
  betterSentence: z.string().min(1).max(600),
  /** The answer may contain patient data (names, dates of birth, record numbers). */
  possiblePhi: z.boolean(),
});
export type ScoreResult = z.infer<typeof scoreResult>;

/** An answer's AI score as the engineer sees it. Fields other than `status` are null until scored. */
export const aiScore = z.object({
  status: z.enum(AI_SCORE_STATUSES),
  score: z.number().int().min(1).max(5).nullable(),
  points: z.array(z.object({ point: z.string(), verdict: z.enum(POINT_VERDICTS) })),
  reason: z.string().nullable(),
  betterSentence: z.string().nullable(),
  possiblePhi: z.boolean(),
  scoredAt: z.string().nullable(),
});
export type AiScore = z.infer<typeof aiScore>;

/** The UI refetches every few seconds while an answer it shows is pending. */
export const AI_SCORE_POLL_MS = 4000;
