import {
  AI_SCORE_POLL_MS,
  type AiScore,
  type AssessmentViewResponse,
  type DayViewResponse,
  type HomeResponse,
  type PointVerdict,
  type QuizItem,
} from "@portal/contracts";

/**
 * AI scores of written answers (docs/M2_SPEC.md "AI scoring"). The answer is saved first and scored in
 * the background; while anything shown is `pending`, its query refetches every `AI_SCORE_POLL_MS`.
 * Pure: unit-tested.
 */

export function scorePending(score: AiScore | null | undefined): boolean {
  return score?.status === "pending";
}

/** TanStack `refetchInterval`: poll while something is pending, stop once nothing is. */
export function pollWhile(pending: boolean): number | false {
  return pending ? AI_SCORE_POLL_MS : false;
}

export function itemsPending(items: readonly QuizItem[] | undefined): boolean {
  return (items ?? []).some((item) => scorePending(item.result?.aiScore));
}

export function dayPending(day: Pick<DayViewResponse, "progress"> | undefined): boolean {
  return (day?.progress ?? []).some((state) => scorePending(state.aiScore));
}

export function assessmentPending(view: Pick<AssessmentViewResponse, "attempt"> | undefined): boolean {
  return itemsPending(view?.attempt?.items);
}

/** Home: a scored kind (write, quiz, assessment) without its value yet is still being scored. */
export function homePending(home: Pick<HomeResponse, "feedback"> | undefined): boolean {
  return (home?.feedback ?? []).some((item) => item.kind !== "mock" && item.value === null);
}

export const VERDICT_TEXT: Record<PointVerdict, string> = {
  met: "Met",
  partly: "Partly",
  not_met: "Not met",
};

/** "4/5", or null before the score is in. */
export function scoreLabel(score: Pick<AiScore, "status" | "score">): string | null {
  return score.status === "scored" && score.score !== null ? `${score.score}/5` : null;
}

/**
 * Write lessons: after a save that has an AI score (pending or not), the player stays on the lesson and
 * shows the feedback; Next then moves on without saving again unless the answer changed.
 */
export function stayAfterSave(state: { aiScore: AiScore | null }): boolean {
  return state.aiScore !== null;
}
