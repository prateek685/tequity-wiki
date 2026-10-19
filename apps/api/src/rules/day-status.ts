import { type DayStatus, type LockReason } from "@portal/contracts";

/**
 * Which days an engineer can work on (docs/M1_SPEC.md "Day status", docs/PORTAL_PLAN.md §2).
 * Pure: the caller loads progress, checkpoints and content readiness.
 */

export const TOTAL_DAYS = 65;
/** Assessment + scorecard after every 5th day, up to Day 60. */
export const ASSESSMENT_INTERVAL = 5;
export const LAST_ASSESSMENT_DAY = 60;
/** Gate 1 after Day 20, Gate 2 after Day 40. */
export const GATE_AFTER_DAY: Readonly<Record<number, 1 | 2>> = { 20: 1, 40: 2 };

export interface Checkpoints {
  /** Days (5, 10 … 60) whose assessment is passed. */
  assessmentsPassed: ReadonlySet<number>;
  /** Days (5, 10 … 60) whose scorecard is submitted. */
  scorecardsSubmitted: ReadonlySet<number>;
  gatesPassed: ReadonlySet<1 | 2>;
}

/** M1 has no assessments, scorecards or gates yet. */
export const NO_CHECKPOINTS: Checkpoints = {
  assessmentsPassed: new Set(),
  scorecardsSubmitted: new Set(),
  gatesPassed: new Set(),
};

export interface DayStatusInput {
  /** YYYY-MM-DD */
  today: string;
  startDate: string;
  doneDays: ReadonlySet<number>;
  /** Days whose lesson is imported. */
  readyDays: ReadonlySet<number>;
  checkpoints: Checkpoints;
  /**
   * Content review (setting `learning.unlockAll`): every imported day is open (or done), with no
   * start-date, previous-day or checkpoint locks. Days not imported stay not_ready.
   */
  unlockAll?: boolean;
  /**
   * Days a manager opened ("Open Day N", table `manual_unlocks`): open despite a lock, except the
   * start-date lock.
   */
  manuallyOpened?: ReadonlySet<number>;
}

export interface DayState {
  day: number;
  status: DayStatus;
  lockReason: LockReason | null;
}

export function hasAssessmentAfter(day: number): boolean {
  return day % ASSESSMENT_INTERVAL === 0 && day <= LAST_ASSESSMENT_DAY;
}

/** The first checkpoint after `day` that is not cleared yet, or null. */
export function unclearedCheckpointAfter(day: number, checkpoints: Checkpoints): LockReason | null {
  if (hasAssessmentAfter(day)) {
    if (!checkpoints.assessmentsPassed.has(day)) return "assessment";
    if (!checkpoints.scorecardsSubmitted.has(day)) return "scorecard";
  }
  const gate = GATE_AFTER_DAY[day];
  if (gate !== undefined && !checkpoints.gatesPassed.has(gate)) return "gate";
  return null;
}

function lockReasonFor(day: number, input: DayStatusInput): LockReason | null {
  if (day === 1) return input.today < input.startDate ? "start_date" : null;
  if (!input.doneDays.has(day - 1)) return "previous_day";
  return unclearedCheckpointAfter(day - 1, input.checkpoints);
}

/** Status of one day. */
export function dayState(day: number, input: DayStatusInput): DayState {
  if (input.doneDays.has(day)) return { day, status: "done", lockReason: null };
  if (input.unlockAll)
    return { day, status: input.readyDays.has(day) ? "open" : "not_ready", lockReason: null };
  const lockReason = lockReasonFor(day, input);
  const opened = lockReason !== "start_date" && input.manuallyOpened?.has(day) === true;
  if (lockReason && !opened) return { day, status: "locked", lockReason };
  return { day, status: input.readyDays.has(day) ? "open" : "not_ready", lockReason: null };
}

/** Status of every day, 1–65. */
export function dayStates(input: DayStatusInput): DayState[] {
  return Array.from({ length: TOTAL_DAYS }, (_, index) => dayState(index + 1, input));
}

/** The lowest open day, or null when nothing is open. */
export function currentDay(states: readonly DayState[]): number | null {
  return states.find((state) => state.status === "open")?.day ?? null;
}
