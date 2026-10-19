import { type QuizStatus } from "@portal/contracts";
import { TOTAL_DAYS } from "./day-status.js";
import { allLessonsDone } from "./lesson.js";

/** Completing a day (docs/LESSON_FORMAT.md). Pure. */

/** Every day has a daily quiz except the final review (Day 65). */
export function hasDailyQuiz(day: number): boolean {
  return day < TOTAL_DAYS;
}

export interface DayCompletionInput {
  day: number;
  lessonIds: readonly string[];
  doneIds: ReadonlySet<string>;
  quizCompleted: boolean;
}

/** All lessons done and the quiz finished (Day 65 has no quiz: its lessons complete it). */
export function isDayComplete(input: DayCompletionInput): boolean {
  if (!allLessonsDone(input.lessonIds, input.doneIds)) return false;
  return !hasDailyQuiz(input.day) || input.quizCompleted;
}

/** The quiz can start once the lessons are done, or any time while `unlockAll` is on. */
export function canStartQuiz(lessonsDone: boolean, unlockAll: boolean): boolean {
  return lessonsDone || unlockAll;
}

export interface QuizStatusInput {
  day: number;
  lessonsDone: boolean;
  unlockAll: boolean;
  attempt: { completed: boolean } | null;
  /** The pool (retired questions excluded) can supply the daily mix. */
  poolReady: boolean;
}

/** What the course player shows for the daily quiz. */
export function quizStatus(input: QuizStatusInput): QuizStatus {
  if (!hasDailyQuiz(input.day)) return "none";
  if (input.attempt) return input.attempt.completed ? "done" : "in_progress";
  if (!canStartQuiz(input.lessonsDone, input.unlockAll)) return "locked";
  return input.poolReady ? "ready" : "not_ready";
}
