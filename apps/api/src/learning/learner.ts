import { type DayStatus, GATE_OUTCOMES, type GateNo, type GateOutcome, type Pace } from "@portal/contracts";
import { z } from "zod";
import { isoFromDate, todayIso } from "../common/dates.js";
import { DomainError } from "../common/domain-error.js";
import { type Tx } from "../prisma/prisma.service.js";
import { type DayState, dayStates, hasAssessmentAfter } from "../rules/day-status.js";
import { computePace } from "../rules/pace.js";
import {
  doneInCurrentRound,
  inCurrentRound,
  openedInCurrentRound,
  roundOfDay,
  weekRounds,
  type WeekRounds,
} from "../rules/rounds.js";

const gateOutcome = z.enum(GATE_OUTCOMES);

/** A recorded gate result, as day status and rounds need it (the full result is in learning/gates.ts). */
export interface LearnerGateResult {
  gate: GateNo;
  round: number;
  outcome: GateOutcome;
  repeatWeeks: number[];
  updatedAt: Date;
}

/** A day_progress row. */
export interface ProgressRow {
  day: number;
  round: number;
  completedAt: Date | null;
}

/** The engineer's active enrollment and the status of every day, loaded once per request. */
export interface Learner {
  userId: string;
  enrollment: { id: string; startDate: string; targetDate: string };
  today: string;
  /** Days done in their current round (a day reopened by a repeat isn't done until it's done again). */
  doneDays: ReadonlySet<number>;
  /** Days completed in any round (days-done counts, pace, check-ins and gates reached). */
  completedDays: ReadonlySet<number>;
  /** Completed day_progress rows, all rounds. */
  progress: readonly ProgressRow[];
  /** Week → current round (repeat blocks); weeks not listed are round 1. */
  rounds: WeekRounds;
  /** Assessment days (5, 10 …) passed in the current round of their week. */
  assessmentsPassed: ReadonlySet<number>;
  /** Recorded gate results, all gates and rounds, lowest round first. */
  gateResults: readonly LearnerGateResult[];
  states: DayState[];
  /** Setting `learning.unlockAll` (content review): every imported day and lesson is open. */
  unlockAll: boolean;
  /** Setting `plan.timezone` (the plan's calendar). */
  timezone: string | undefined;
  /** Days whose lesson is imported. */
  readyDays: ReadonlySet<number>;
  /** Assessment day → when a manager last allowed its retake now (table `manual_unlocks`). */
  retakeUnlocks: ReadonlyMap<number, Date>;
}

/** Setting `learning.unlockAll`; off when missing. */
export async function loadUnlockAll(tx: Tx): Promise<boolean> {
  const row = await tx.setting.findUnique({ where: { key: "learning.unlockAll" }, select: { value: true } });
  return row?.value === true;
}

/** Group rows by a key, keeping their order. */
export function groupBy<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const row of rows) {
    const list = groups.get(key(row));
    if (list) list.push(row);
    else groups.set(key(row), [row]);
  }
  return groups;
}

/** Load the learner, or null when they have no active enrollment. */
export async function loadLearner(tx: Tx, userId: string): Promise<Learner | null> {
  return (await loadLearners(tx, [userId])).get(userId) ?? null;
}

/**
 * Load several learners at once (user id → learner; users without an active enrollment are left out).
 * One query per kind of data whatever the number of users (the manager's Team and Gates pages); row-level
 * security decides what the caller sees, exactly as for one learner.
 */
export async function loadLearners(tx: Tx, userIds: readonly string[]): Promise<Map<string, Learner>> {
  const learners = new Map<string, Learner>();
  if (userIds.length === 0) return learners;
  const enrollmentRows = await tx.enrollment.findMany({
    where: { userId: { in: [...new Set(userIds)] }, status: "active" },
    orderBy: { cycleNo: "desc" },
    select: { id: true, userId: true, startDate: true, targetDate: true },
  });
  // The latest active cycle of each user.
  const enrollments = new Map<string, (typeof enrollmentRows)[number]>();
  for (const row of enrollmentRows) if (!enrollments.has(row.userId)) enrollments.set(row.userId, row);
  if (enrollments.size === 0) return learners;
  const enrollmentIds = [...enrollments.values()].map((row) => row.id);
  const progressRows = await tx.dayProgress.findMany({
    where: { enrollmentId: { in: enrollmentIds }, completedAt: { not: null } },
    orderBy: { completedAt: "asc" },
    select: { enrollmentId: true, day: true, round: true, completedAt: true },
  });
  const gateRows = await tx.gateResult.findMany({
    where: { enrollmentId: { in: enrollmentIds } },
    orderBy: [{ gate: "asc" }, { round: "asc" }],
    select: {
      enrollmentId: true,
      gate: true,
      round: true,
      outcome: true,
      repeatWeeks: true,
      updatedAt: true,
    },
  });
  const days = await tx.contentDay.findMany({ select: { day: true } });
  const settings = await tx.setting.findMany({
    where: { key: { in: ["plan.timezone", "learning.unlockAll"] } },
    select: { key: true, value: true },
  });
  const timezoneValue = settings.find((row) => row.key === "plan.timezone")?.value;
  const timezone = typeof timezoneValue === "string" ? timezoneValue : undefined;
  const unlockAll = settings.find((row) => row.key === "learning.unlockAll")?.value === true;
  const passedRows = await tx.quizAttempt.findMany({
    where: { enrollmentId: { in: enrollmentIds }, kind: "assessment", passed: true },
    select: { enrollmentId: true, day: true, round: true },
  });
  // Manager unlocks (the engineer, their managers and admins can read them).
  const unlockRows = await tx.manualUnlock.findMany({
    where: { enrollmentId: { in: enrollmentIds } },
    orderBy: { createdAt: "asc" },
    select: { enrollmentId: true, kind: true, day: true, createdAt: true },
  });
  const readyDays = new Set(days.map((row) => row.day));
  const progressOf = groupBy(progressRows, (row) => row.enrollmentId);
  const gatesOf = groupBy(gateRows, (row) => row.enrollmentId);
  const passedOf = groupBy(passedRows, (row) => row.enrollmentId);
  const unlocksOf = groupBy(unlockRows, (row) => row.enrollmentId);
  for (const [userId, enrollment] of enrollments) {
    learners.set(
      userId,
      buildLearner({
        userId,
        enrollment,
        progress: (progressOf.get(enrollment.id) ?? []).map(({ day, round, completedAt }) => ({
          day,
          round,
          completedAt,
        })),
        gateRows: gatesOf.get(enrollment.id) ?? [],
        passed: passedOf.get(enrollment.id) ?? [],
        unlocks: unlocksOf.get(enrollment.id) ?? [],
        readyDays,
        timezone,
        unlockAll,
      }),
    );
  }
  return learners;
}

/** One learner from their loaded rows (no database access). */
function buildLearner(input: {
  userId: string;
  enrollment: { id: string; startDate: Date; targetDate: Date };
  progress: ProgressRow[];
  gateRows: readonly {
    gate: number;
    round: number;
    outcome: string;
    repeatWeeks: number[];
    updatedAt: Date;
  }[];
  passed: readonly { day: number; round: number }[];
  unlocks: readonly { kind: string; day: number; createdAt: Date }[];
  readyDays: ReadonlySet<number>;
  timezone: string | undefined;
  unlockAll: boolean;
}): Learner {
  const { userId, enrollment, progress, passed, unlocks, readyDays, timezone, unlockAll } = input;
  const gateResults: LearnerGateResult[] = input.gateRows.map((row) => ({
    gate: row.gate === 2 ? 2 : 1,
    round: row.round,
    outcome: gateOutcome.parse(row.outcome),
    repeatWeeks: row.repeatWeeks,
    updatedAt: row.updatedAt,
  }));
  const rounds = weekRounds(
    gateResults
      .filter((row) => row.outcome === "repeat")
      .map((row) => ({ round: row.round, repeatWeeks: row.repeatWeeks, recordedAt: row.updatedAt })),
  );
  const today = todayIso(new Date(), timezone);
  const startDate = isoFromDate(enrollment.startDate);
  const doneDays = doneInCurrentRound(progress, rounds);
  const completedDays = new Set(progress.map((row) => row.day));
  const assessmentsPassed = new Set(inCurrentRound(passed, rounds).map((row) => row.day));
  const states = dayStates({
    today,
    startDate,
    doneDays,
    readyDays,
    checkpoints: {
      assessmentsPassed,
      // The Friday scorecard is a lesson of the week's 5th day: done with the day (in its round).
      scorecardsSubmitted: new Set([...doneDays].filter(hasAssessmentAfter)),
      gatesPassed: gatesPassed(gateResults),
    },
    unlockAll,
    // An "Open Day N" from an earlier round doesn't open the day again in the new round.
    manuallyOpened: openedInCurrentRound(
      unlocks.filter((row) => row.kind === "next_day"),
      rounds,
    ),
  });
  return {
    userId,
    enrollment: { id: enrollment.id, startDate, targetDate: isoFromDate(enrollment.targetDate) },
    today,
    doneDays,
    completedDays,
    progress,
    rounds,
    assessmentsPassed,
    gateResults,
    states,
    unlockAll,
    timezone,
    readyDays,
    retakeUnlocks: new Map(
      unlocks.filter((row) => row.kind === "retake_now").map((row) => [row.day, row.createdAt]),
    ),
  };
}

/** Gates whose latest recorded round is a pass (with or without focus items). */
function gatesPassed(results: readonly LearnerGateResult[]): Set<GateNo> {
  const passed = new Set<GateNo>();
  for (const gate of [1, 2] as const) {
    const latest = results.filter((row) => row.gate === gate).at(-1);
    if (latest && latest.outcome !== "repeat") passed.add(gate);
  }
  return passed;
}

/** The current round of a day for this learner (1 without an enrollment). */
export function dayRound(learner: Learner | null, day: number): number {
  return learner ? roundOfDay(learner.rounds, day) : 1;
}

export async function requireLearner(tx: Tx, userId: string): Promise<Learner> {
  const learner = await loadLearner(tx, userId);
  if (!learner) throw new DomainError("NO_ENROLLMENT");
  return learner;
}

/** The day's status; throws unless the engineer may work on it (open or done). */
export function requireWorkableDay(learner: Learner, day: number): DayStatus {
  const state = learner.states[day - 1];
  if (!state || state.status === "locked") throw new DomainError("DAY_LOCKED");
  if (state.status === "not_ready") throw new DomainError("DAY_NOT_READY");
  return state.status;
}

/**
 * Serialise work on one engineer's day (start quiz, save lesson, answer) for the rest of the transaction.
 * READ COMMITTED alone would let two concurrent requests each miss the other's write and leave the day
 * incomplete; after the lock, each statement sees the other transaction's committed rows.
 */
export async function lockDay(tx: Tx, enrollmentId: string, day: number): Promise<void> {
  const key = `day:${enrollmentId}:${day}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

/** The same for one engineer's assessment (start, answer): a double click can't create two attempts. */
export async function lockAssessment(tx: Tx, enrollmentId: string, day: number): Promise<void> {
  const key = `assessment:${enrollmentId}:${day}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

export const PACE_DEFAULTS = { "plan.targetDays": 90, "pace.behindToleranceDays": 3 } as const;
type PaceSetting = keyof typeof PACE_DEFAULTS;

/** The learner's pace (settings `plan.targetDays`, `pace.behindToleranceDays`, their pauses). */
export async function loadPace(tx: Tx, learner: Learner): Promise<Pace> {
  const paces = await loadPaces(tx, [learner]);
  return paces.get(learner.enrollment.id) as Pace;
}

/** The pace of several learners (enrollment id → pace): one query for the settings, one for the pauses. */
export async function loadPaces(tx: Tx, learners: readonly Learner[]): Promise<Map<string, Pace>> {
  const paces = new Map<string, Pace>();
  if (learners.length === 0) return paces;
  const settings = await tx.setting.findMany({
    where: { key: { in: Object.keys(PACE_DEFAULTS) } },
    select: { key: true, value: true },
  });
  const pauseRows = await tx.pause.findMany({
    where: { enrollmentId: { in: learners.map((learner) => learner.enrollment.id) } },
    select: { enrollmentId: true, fromDate: true, toDate: true },
  });
  const pausesOf = groupBy(pauseRows, (row) => row.enrollmentId);
  const setting = (key: PaceSetting): number => {
    const value = settings.find((row) => row.key === key)?.value;
    return typeof value === "number" ? value : PACE_DEFAULTS[key];
  };
  for (const learner of learners) {
    const pauses = pausesOf.get(learner.enrollment.id) ?? [];
    paces.set(
      learner.enrollment.id,
      computePace({
        today: learner.today,
        startDate: learner.enrollment.startDate,
        targetDate: learner.enrollment.targetDate,
        pauses: pauses.map((p) => ({ from: isoFromDate(p.fromDate), to: isoFromDate(p.toDate) })),
        daysDone: learner.completedDays.size,
        targetDays: setting("plan.targetDays"),
        toleranceDays: setting("pace.behindToleranceDays"),
      }),
    );
  }
  return paces;
}
