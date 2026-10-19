import { type ScoreResult } from "@portal/contracts";

/**
 * The one door to a language model (docs/PORTAL_PLAN.md §7.1): used by the worker only, for scoring
 * written answers. Implementations: Anthropic (when ANTHROPIC_API_KEY is set) and a deterministic
 * fake (development without a key, and all tests).
 */
export interface LlmClient {
  /** Which scorer this is, stored on every score with the model the call used. */
  readonly name: string;
  score(input: ScoreInput): Promise<ScoredAnswer>;
}

/** Injection token for the scorer: `LlmClient`, or null when none is configured (production without a key). */
export const LLM_CLIENT = Symbol("LLM_CLIENT");

export const SCORE_KINDS = ["quiz", "assessment", "write"] as const;
export type ScoreKind = (typeof SCORE_KINDS)[number];

export interface ScoreInput {
  kind: ScoreKind;
  /** What the engineer was asked: the question (and the client's line), or the write lesson's task. */
  task: string;
  /** The engineer's answer. Never logged. */
  answer: string;
  modelAnswer: string;
  /** 2–3 points, judged in this order. */
  scoringPoints: string[];
}

/** The scorer's raw result (not yet checked against the guide) and the model that produced it. */
export interface ScoredAnswer {
  result: ScoreResult;
  model: string;
}
