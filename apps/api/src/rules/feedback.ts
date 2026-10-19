import { type FeedbackItem, type LessonEntry } from "@portal/contracts";
import { roundOne } from "./scorecard.js";

/**
 * The Home "Latest feedback" card and the Progress writing average (packages/contracts/src/progress.ts).
 * Pure; the service loads the rows.
 */

export const FEEDBACK_LIMIT = 4;
/** Progress "Writing": the average of the last 10 scored write lessons. */
export const WRITING_WINDOW = 10;
/** The reflect lesson's "one thing to fix next time" field. */
export const FIX_NEXT_FIELD = "fix-next";

/** Average of the newest scores (given newest first), 1 decimal; null when there are none. */
export function writingAverage(newestFirst: readonly number[]): { average: number; count: number } | null {
  const scores = newestFirst.slice(0, WRITING_WINDOW);
  if (scores.length === 0) return null;
  return { average: roundOne(scores.reduce((a, b) => a + b, 0) / scores.length), count: scores.length };
}

/** A mock log's rubric average over the criteria that came up, "2.8"; null when none was scored. */
export function rubricAverageText(rubric: LessonEntry["rubric"]): string | null {
  const scores = Object.values(rubric).filter((score): score is number => score !== null);
  if (scores.length === 0) return null;
  return roundOne(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
}

export interface MockFeedback {
  day: number;
  /** The reflect lesson (the link target). */
  lessonId: string;
  /** The day's mock lesson title (else the reflect lesson's). */
  title: string;
  entry: Pick<LessonEntry, "values" | "rubric">;
  at: Date;
}

export function mockFeedback(mock: MockFeedback): FeedbackItem {
  const fix = mock.entry.values[FIX_NEXT_FIELD]?.trim();
  return {
    kind: "mock",
    day: mock.day,
    title: `Day ${mock.day} · ${mock.title}`,
    detail: fix ? `Fix next time: ${fix}` : "Call scored",
    value: rubricAverageText(mock.entry.rubric),
    href: `/app/day/${mock.day}/${mock.lessonId}`,
    at: mock.at.toISOString(),
  };
}

export function quizFeedback(quiz: { day: number; correct: number; total: number; at: Date }): FeedbackItem {
  return {
    kind: "quiz",
    day: quiz.day,
    title: `Day ${quiz.day} · Daily quiz`,
    detail: "Multiple choice",
    value: `${quiz.correct}/${quiz.total}`,
    href: `/app/day/${quiz.day}/quiz`,
    at: quiz.at.toISOString(),
  };
}

/** `day` is the assessment's day (5, 10 …); its week is day / 5. */
export function assessmentFeedback(assessment: {
  day: number;
  correct: number;
  total: number;
  at: Date;
}): FeedbackItem {
  return {
    kind: "assessment",
    day: assessment.day,
    title: `Week ${assessment.day / 5} assessment`,
    detail: "Multiple choice",
    value: `${assessment.correct}/${assessment.total}`,
    href: `/app/assessment/${assessment.day}`,
    at: assessment.at.toISOString(),
  };
}

export function writeFeedback(write: {
  day: number;
  lessonId: string;
  title: string;
  score: number | null;
  betterSentence: string | null;
  at: Date;
}): FeedbackItem {
  const scored = write.score !== null;
  return {
    kind: "write",
    day: write.day,
    title: `Day ${write.day} · ${write.title}`,
    detail: scored && write.betterSentence ? write.betterSentence : "Being scored…",
    value: scored ? `${write.score}/5` : null,
    href: `/app/day/${write.day}/${write.lessonId}`,
    at: write.at.toISOString(),
  };
}

/** The newest items first, at most 4. */
export function latestFeedback(items: readonly FeedbackItem[]): FeedbackItem[] {
  return [...items].sort((a, b) => b.at.localeCompare(a.at)).slice(0, FEEDBACK_LIMIT);
}
