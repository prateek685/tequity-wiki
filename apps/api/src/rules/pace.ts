import { type Pace } from "@portal/contracts";
import { TOTAL_DAYS } from "./day-status.js";
import { daysBetween } from "../common/dates.js";

/** Pace note (docs/M1_SPEC.md "Pace"). Pure; dates are YYYY-MM-DD. */

export interface PaceInput {
  today: string;
  startDate: string;
  targetDate: string;
  pauses: readonly { from: string; to: string }[];
  daysDone: number;
  /** settings `plan.targetDays` (90). */
  targetDays: number;
  /** settings `pace.behindToleranceDays` (3). */
  toleranceDays: number;
}

/** Pause days that fall between the start date and today (both inclusive). */
export function pauseDaysSoFar(pauses: PaceInput["pauses"], startDate: string, today: string): number {
  let total = 0;
  for (const pause of pauses) {
    const from = pause.from > startDate ? pause.from : startDate;
    const to = pause.to < today ? pause.to : today;
    if (to >= from) total += daysBetween(from, to) + 1;
  }
  return total;
}

export function computePace(input: PaceInput): Pace {
  const base = { daysDone: input.daysDone, targetDate: input.targetDate };
  if (input.today < input.startDate) {
    // `0 - n`, not `-n`: avoids -0 in the response.
    return { ...base, status: "not_started", expectedDone: 0, difference: 0 - input.daysDone };
  }
  const calendarDays = daysBetween(input.startDate, input.today) + 1;
  const elapsed = Math.max(0, calendarDays - pauseDaysSoFar(input.pauses, input.startDate, input.today));
  const expectedDone = Math.min(
    TOTAL_DAYS,
    Math.floor((TOTAL_DAYS * elapsed) / Math.max(1, input.targetDays)),
  );
  const difference = expectedDone - input.daysDone;
  const status = difference > input.toleranceDays ? "behind" : difference < 0 ? "ahead" : "on_pace";
  return { ...base, status, expectedDone, difference };
}
