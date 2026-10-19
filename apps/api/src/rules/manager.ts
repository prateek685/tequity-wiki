import {
  CHECKIN_DAYS,
  type FinalStatus,
  type GateStatus,
  type Rag,
  type TrackerWeek,
  type UnlockOption,
  type WeeklyScorecard,
} from "@portal/contracts";
import {
  ASSESSMENT_INTERVAL,
  type DayState,
  GATE_AFTER_DAY,
  hasAssessmentAfter,
  TOTAL_DAYS,
} from "./day-status.js";
import { DAYS_PER_WEEK, weekOf } from "./scorecard.js";
import { daysBetween } from "../common/dates.js";

/**
 * Manager v1 rules (docs/PORTAL_PLAN.md §9 "Manager", packages/contracts/src/manager.ts). Pure: the
 * caller loads the engineer's progress, attempts, check-ins and reviews.
 */

export const WEEKS = 13;

/** A check-in is due for 7 days after its day is completed, then overdue. */
export const CHECKIN_DUE_DAYS = 7;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

// ── Unlock ──────────────────────────────────────────────────────────────────────────────────────

export interface LatestAssessment {
  /** The assessment's day (5, 10 … 60). */
  day: number;
  completed: boolean;
  passed: boolean | null;
  /** When the retake opens (after any manual "retake now"). */
  retakeAt: Date | null;
}

export interface UnlockInput {
  /** The engineer's most recently started assessment attempt, or null. */
  latestAssessment: LatestAssessment | null;
  states: readonly DayState[];
  /** Days whose lesson is imported. */
  readyDays: ReadonlySet<number>;
  now: Date;
}

/**
 * What "Unlock" would do now: let a failed assessment be retaken before the wait is over; else open
 * the first locked day (unless it waits for the start date or isn't imported); else nothing.
 */
export function unlockOption(input: UnlockInput): UnlockOption | null {
  const latest = input.latestAssessment;
  if (
    latest?.completed &&
    latest.passed === false &&
    latest.retakeAt !== null &&
    latest.retakeAt.getTime() > input.now.getTime()
  ) {
    return {
      kind: "retake_now",
      day: latest.day,
      label: `Allow the Week ${weekOf(latest.day)} assessment retake now`,
    };
  }
  const locked = input.states.find((state) => state.status === "locked");
  if (locked && locked.lockReason !== "start_date" && input.readyDays.has(locked.day)) {
    return { kind: "next_day", day: locked.day, label: `Open Day ${locked.day}` };
  }
  return null;
}

/**
 * When a failed attempt's retake opens, given the latest "retake now" unlock for that assessment: an
 * unlock made after the attempt finished (and before the wait ended) opens it at the unlock time.
 */
export function effectiveRetakeAt(
  retakeAt: Date | null,
  completedAt: Date | null,
  unlockedAt: Date | null,
): Date | null {
  if (!unlockedAt || !completedAt || unlockedAt.getTime() < completedAt.getTime()) return retakeAt;
  if (retakeAt && retakeAt.getTime() <= unlockedAt.getTime()) return retakeAt;
  return unlockedAt;
}

// ── Next checkpoint ─────────────────────────────────────────────────────────────────────────────

export interface CheckpointProgress {
  /** Days done (in their current round). */
  doneDays: ReadonlySet<number>;
  /** Assessment days passed (in their current round). */
  assessmentsPassed: ReadonlySet<number>;
  /** Check-in days recorded. */
  checkins: ReadonlySet<number>;
  gatesPassed: ReadonlySet<1 | 2>;
  /** Assessment days whose latest attempt (this round) failed: waiting for the retake. */
  assessmentsFailed?: ReadonlySet<number>;
  /** Gate states, when known (Gate 1 from M5). */
  gates?: readonly { gate: 1 | 2; status: GateStatus }[];
  /** The final review's status, when Day 65 is imported. */
  finalReview?: FinalStatus;
}

/**
 * What the engineer (or manager) must do next. First a failed assessment waiting for its retake
 * ("Week 2 assessment retake"), then a gate to book or record ("Gate 1 to book", "Gate 1 to record");
 * else the next checkpoint not cleared yet from the end of the unbroken run of done days on:
 * "Assessment after Day 25", "Check-in after Day 10", "Gate 1 after Day 20" (on the same day:
 * assessment, check-in, gate). Days reopened by a repeat count as not done, so a repeat points at its
 * own assessments. Null after the last one.
 */
export function nextCheckpoint(progress: CheckpointProgress): string | null {
  const failed = [...(progress.assessmentsFailed ?? [])].sort((a, b) => a - b)[0];
  if (failed !== undefined) return `Week ${weekOf(failed)} assessment retake`;
  for (const { gate, status } of progress.gates ?? []) {
    if (status === "to_book" || status === "rerun") return `Gate ${gate} to book`;
    if (status === "recap_sent") return `Gate ${gate} to record`;
  }
  if (progress.finalReview === "to_book") return "Final review to book";
  let frontier = 0;
  while (frontier < TOTAL_DAYS && progress.doneDays.has(frontier + 1)) frontier++;
  for (let day = ASSESSMENT_INTERVAL; day <= TOTAL_DAYS; day += ASSESSMENT_INTERVAL) {
    if (day < frontier) continue;
    if (hasAssessmentAfter(day) && !progress.assessmentsPassed.has(day)) return `Assessment after Day ${day}`;
    if (isCheckinDay(day) && !progress.checkins.has(day)) return `Check-in after Day ${day}`;
    const gate = GATE_AFTER_DAY[day];
    if (gate !== undefined && !progress.gatesPassed.has(gate)) return `Gate ${gate} after Day ${day}`;
  }
  if (progress.finalReview === "locked") return "Final review after Day 64";
  return null;
}

// ── Check-ins ───────────────────────────────────────────────────────────────────────────────────

export function isCheckinDay(day: number): boolean {
  return (CHECKIN_DAYS as readonly number[]).includes(day);
}

/** The week a check-in falls in (after Day 10 → Week 2). */
export function checkinWeek(afterDay: number): number {
  return weekOf(afterDay);
}

export interface CheckinDue {
  day: number;
  status: "due" | "overdue";
  /** due: days left (0 = today) · overdue: days past the window. */
  days: number;
}

/**
 * Check-in days reached (the day completed, on `completedOn`, a YYYY-MM-DD in the plan's calendar)
 * without a check-in yet: due for 7 days, then overdue.
 */
export function checkinsDue(input: {
  completedOn: ReadonlyMap<number, string>;
  recorded: ReadonlySet<number>;
  today: string;
}): CheckinDue[] {
  return CHECKIN_DAYS.flatMap((day): CheckinDue[] => {
    const completed = input.completedOn.get(day);
    if (!completed || input.recorded.has(day)) return [];
    const since = Math.max(0, daysBetween(completed, input.today));
    return since <= CHECKIN_DUE_DAYS
      ? [{ day, status: "due" as const, days: CHECKIN_DUE_DAYS - since }]
      : [{ day, status: "overdue" as const, days: since - CHECKIN_DUE_DAYS }];
  });
}

/** "After Day 10 · due in 3 days", "After Day 10 · due today", "After Day 10 · overdue 4 days". */
export function checkinDueDetail(due: CheckinDue): string {
  const when =
    due.status === "overdue"
      ? `overdue ${plural(due.days, "day")}`
      : due.days === 0
        ? "due today"
        : `due in ${plural(due.days, "day")}`;
  return `After Day ${due.day} · ${when}`;
}

// ── 13-week tracker ─────────────────────────────────────────────────────────────────────────────

const CHECKPOINT_BY_WEEK: Readonly<Record<number, TrackerWeek["checkpoint"]>> = {
  2: "checkin",
  4: "gate1",
  6: "checkin",
  8: "gate2",
  10: "checkin",
  12: "checkin",
  13: "final",
};

/** The week each gate falls in (Gate 1 after Day 20 → Week 4). */
const GATE_WEEK: Readonly<Record<1 | 2, number>> = { 1: 4, 2: 8 };

/**
 * The PDF §5.5 tracker: per week, days done (in the week's current round), the scorecard, the
 * checkpoint and its RAG and note: the check-in's, or on a gate week the latest recorded gate round's.
 */
export function buildTracker(input: {
  doneDays: ReadonlySet<number>;
  scorecards: readonly WeeklyScorecard[];
  checkins: readonly { afterDay: number; rag: Rag; note: string }[];
  gates?: readonly { gate: 1 | 2; rag: Rag; note: string }[];
}): TrackerWeek[] {
  return Array.from({ length: WEEKS }, (_, index) => {
    const week = index + 1;
    const first = (week - 1) * DAYS_PER_WEEK + 1;
    let daysDone = 0;
    for (let day = first; day < first + DAYS_PER_WEEK && day <= TOTAL_DAYS; day++) {
      if (input.doneDays.has(day)) daysDone++;
    }
    const checkin =
      input.checkins.find((row) => checkinWeek(row.afterDay) === week) ??
      input.gates?.find((row) => GATE_WEEK[row.gate] === week);
    return {
      week,
      daysDone,
      pillars: input.scorecards.find((card) => card.week === week)?.scores ?? null,
      checkpoint: CHECKPOINT_BY_WEEK[week] ?? null,
      rag: checkin?.rag ?? null,
      note: checkin?.note ?? null,
    };
  });
}
