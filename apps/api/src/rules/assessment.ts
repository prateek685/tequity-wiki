import { type AssessmentStatus, type QuestionType } from "@portal/contracts";
import { shuffled } from "./quiz-pick.js";

/**
 * Weekly assessment after Days 5, 10 … 60 (docs/PORTAL_PLAN.md "Assessment", score #4). Pure: the
 * caller loads the pool, the engineer's earlier attempts and the settings.
 */

export const ASSESSMENT_MCQ = 6;
export const ASSESSMENT_SCENARIO = 2;
/** Multiple choice + scenario; only these count towards the pass mark. */
export const ASSESSMENT_CHOICE = ASSESSMENT_MCQ + ASSESSMENT_SCENARIO;
export const ASSESSMENT_WRITTEN = 2;
export const ASSESSMENT_QUESTIONS = ASSESSMENT_CHOICE + ASSESSMENT_WRITTEN;

export const ASSESSMENT_DEFAULTS = { passPercent: 60, retakeHours: 24 } as const;

interface Candidate {
  id: string;
  type: QuestionType;
}

const isChoice = (type: QuestionType) => type !== "written";

/** True when the pool can supply 8 multiple choice/scenario and 2 written questions. */
export function canSupplyAssessment(pool: readonly Candidate[]): boolean {
  const choice = pool.filter((q) => isChoice(q.type)).length;
  const written = pool.filter((q) => q.type === "written").length;
  return choice >= ASSESSMENT_CHOICE && written >= ASSESSMENT_WRITTEN;
}

/**
 * Take up to `quota[type]` of each type from `candidates` (in order), then fill the rest of `total`
 * with any of them. Mutates nothing; returns the chosen ones.
 */
function take<T extends Candidate>(
  candidates: readonly T[],
  quota: Partial<Record<QuestionType, number>>,
  total: number,
  already: readonly T[],
): T[] {
  const chosen: T[] = [];
  const room = () => total - already.length - chosen.length;
  const count = (type: QuestionType) => [...already, ...chosen].filter((q) => q.type === type).length;
  for (const q of candidates) {
    if (room() <= 0) break;
    if (count(q.type) < (quota[q.type] ?? 0)) chosen.push(q);
  }
  for (const q of candidates) {
    if (room() <= 0) break;
    if (!chosen.includes(q)) chosen.push(q);
  }
  return chosen;
}

/**
 * Pick one assessment attempt: 8 choice questions (6 mcq + 2 scenario when the pool has them, else any
 * mix) and 2 written, at random within each type. Questions not asked in `askedIds` (the engineer's
 * earlier attempts) come first; already-asked ones only top up a short pool. Ordered mcq, scenario,
 * written. Returns null when the pool can't supply 8 + 2.
 */
export function pickAssessment<T extends Candidate>(
  pool: readonly T[],
  askedIds: ReadonlySet<string> = new Set(),
  random: () => number = Math.random,
): T[] | null {
  if (!canSupplyAssessment(pool)) return null;
  const fresh = shuffled(
    pool.filter((q) => !askedIds.has(q.id)),
    random,
  );
  const asked = shuffled(
    pool.filter((q) => askedIds.has(q.id)),
    random,
  );
  const quota = { mcq: ASSESSMENT_MCQ, scenario: ASSESSMENT_SCENARIO };

  const choiceOf = (list: T[]) => list.filter((q) => isChoice(q.type));
  const choice = take(choiceOf(fresh), quota, ASSESSMENT_CHOICE, []);
  choice.push(...take(choiceOf(asked), quota, ASSESSMENT_CHOICE, choice));

  const writtenOf = (list: T[]) => list.filter((q) => q.type === "written");
  const written = [...writtenOf(fresh), ...writtenOf(asked)].slice(0, ASSESSMENT_WRITTEN);

  const order: Record<QuestionType, number> = { mcq: 0, scenario: 1, written: 2 };
  return [...choice, ...written].sort((a, b) => order[a.type] - order[b.type]);
}

/** Percent correct on the choice questions, rounded down (0 when there are none). */
export function assessmentPercent(choiceCorrect: number, choiceTotal: number): number {
  if (choiceTotal <= 0) return 0;
  return Math.floor((choiceCorrect * 100) / choiceTotal);
}

export interface AssessmentScore {
  choiceCorrect: number;
  choiceTotal: number;
  percent: number;
  passed: boolean;
  /** Failed only: when the retake opens. */
  retakeAt: Date | null;
}

/** Score a finished attempt. */
export function scoreAssessment(input: {
  choiceCorrect: number;
  choiceTotal: number;
  passPercent: number;
  retakeHours: number;
  completedAt: Date;
}): AssessmentScore {
  const percent = assessmentPercent(input.choiceCorrect, input.choiceTotal);
  const passed = input.choiceTotal > 0 && percent >= input.passPercent;
  return {
    choiceCorrect: input.choiceCorrect,
    choiceTotal: input.choiceTotal,
    percent,
    passed,
    retakeAt: passed ? null : retakeOpensAt(input.completedAt, input.retakeHours),
  };
}

export function retakeOpensAt(completedAt: Date, retakeHours: number): Date {
  return new Date(completedAt.getTime() + retakeHours * 3_600_000);
}

export interface AttemptSummary {
  completed: boolean;
  passed: boolean | null;
  retakeAt: Date | null;
}

export interface AssessmentStatusInput {
  /** All 5 days of the week are done. */
  weekDone: boolean;
  unlockAll: boolean;
  /** The pool can supply an attempt (canSupplyAssessment). */
  poolReady: boolean;
  /** Every attempt so far (any order). */
  attempts: readonly AttemptSummary[];
  /** The latest attempt, or null before the first start. */
  latest: AttemptSummary | null;
}

/**
 * passed (any attempt passed) · in_progress (the latest is open) · locked (week not done, unless
 * unlockAll) · failed (the latest failed) · not_ready (no pool) · ready.
 */
export function assessmentStatus(input: AssessmentStatusInput): AssessmentStatus {
  if (input.attempts.some((a) => a.completed && a.passed)) return "passed";
  if (input.latest && !input.latest.completed) return "in_progress";
  if (!input.weekDone && !input.unlockAll) return "locked";
  if (input.latest?.completed) return "failed";
  return input.poolReady ? "ready" : "not_ready";
}

/** A retake can start now: failed, the wait is over, and the pool can supply it. */
export function canRetake(
  status: AssessmentStatus,
  latest: AttemptSummary | null,
  poolReady: boolean,
  now: Date,
) {
  if (status !== "failed" || !poolReady) return false;
  return !latest?.retakeAt || latest.retakeAt.getTime() <= now.getTime();
}
