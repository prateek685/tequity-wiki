import { DAYS_PER_WEEK, weekOf } from "./scorecard.js";

/**
 * Repeat blocks (docs/PORTAL_PLAN.md §1 "Repeat after a failed gate"). Pure.
 *
 * A gate result of round N with outcome `repeat` reopens its 2 weeks as round N + 1: those weeks' days,
 * their assessments and Friday scorecards are done again in that round (round N's rows are kept). Every
 * other week stays in the round it was last done in (1 unless an earlier repeat reopened it). So a day's
 * current round = 1 + the round of the latest repeat result that names its week.
 */

/** A recorded result with outcome `repeat`. */
export interface RepeatResult {
  /** The gate round the result belongs to. */
  round: number;
  repeatWeeks: readonly number[];
  /** When the result was last saved: the reopened round counts from then (e.g. for manual unlocks). */
  recordedAt: Date;
}

export interface WeekRound {
  round: number;
  /** When this round opened (null for round 1). */
  openedAt: Date | null;
}

const ROUND_ONE: WeekRound = { round: 1, openedAt: null };

/** Week → its current round (weeks never repeated are left out: round 1). */
export type WeekRounds = ReadonlyMap<number, WeekRound>;

export function weekRounds(repeats: readonly RepeatResult[]): WeekRounds {
  const rounds = new Map<number, WeekRound>();
  for (const result of [...repeats].sort((a, b) => a.round - b.round)) {
    for (const week of result.repeatWeeks) {
      rounds.set(week, { round: result.round + 1, openedAt: result.recordedAt });
    }
  }
  return rounds;
}

export function weekRoundOf(rounds: WeekRounds, week: number): WeekRound {
  return rounds.get(week) ?? ROUND_ONE;
}

export function roundOfDay(rounds: WeekRounds, day: number): number {
  return weekRoundOf(rounds, weekOf(day)).round;
}

/** Days 6–10 for Week 2. */
export function daysOfWeek(week: number): number[] {
  return Array.from({ length: DAYS_PER_WEEK }, (_, i) => (week - 1) * DAYS_PER_WEEK + 1 + i);
}

/** Days completed in their current round (what day status, locks and "done" mean). */
export function doneInCurrentRound(
  rows: readonly { day: number; round: number; completedAt: Date | null }[],
  rounds: WeekRounds,
): Set<number> {
  return new Set(
    rows
      .filter((row) => row.completedAt !== null && row.round === roundOfDay(rounds, row.day))
      .map((r) => r.day),
  );
}

/** Rows of the current round of their day (e.g. assessment attempts of the reopened weeks). */
export function inCurrentRound<T extends { day: number; round: number }>(
  rows: readonly T[],
  rounds: WeekRounds,
): T[] {
  return rows.filter((row) => row.round === roundOfDay(rounds, row.day));
}

/**
 * Days a manager opened ("Open Day N") that still count: an unlock made before the day's current
 * round opened belonged to the earlier round.
 */
export function openedInCurrentRound(
  unlocks: readonly { day: number; createdAt: Date }[],
  rounds: WeekRounds,
): Set<number> {
  return new Set(
    unlocks
      .filter((unlock) => {
        const openedAt = weekRoundOf(rounds, weekOf(unlock.day)).openedAt;
        return openedAt === null || unlock.createdAt.getTime() >= openedAt.getTime();
      })
      .map((unlock) => unlock.day),
  );
}
