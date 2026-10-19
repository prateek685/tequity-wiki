import { describe, expect, it } from "vitest";
import { dayStates, type DayStatusInput } from "./day-status.js";
import {
  daysOfWeek,
  doneInCurrentRound,
  inCurrentRound,
  openedInCurrentRound,
  roundOfDay,
  weekRounds,
} from "./rounds.js";

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const T0 = new Date("2026-10-01T10:00:00Z");
const T1 = new Date("2026-10-05T10:00:00Z");
const T2 = new Date("2026-10-08T10:00:00Z");

describe("rounds", () => {
  it("puts the weeks a repeat result names in the next round; other weeks stay round 1", () => {
    const rounds = weekRounds([{ round: 1, repeatWeeks: [2, 3], recordedAt: T1 }]);
    expect(range(1, 20).map((day) => roundOfDay(rounds, day))).toEqual([
      ...Array<number>(5).fill(1),
      ...Array<number>(10).fill(2),
      ...Array<number>(5).fill(1),
    ]);
    expect(rounds.get(2)).toEqual({ round: 2, openedAt: T1 });
  });

  it("uses the latest repeat for a week named twice (gate round 2 → round 3)", () => {
    const rounds = weekRounds([
      { round: 2, repeatWeeks: [1, 3], recordedAt: T2 },
      { round: 1, repeatWeeks: [2, 3], recordedAt: T1 },
    ]);
    expect([1, 6, 11, 16].map((day) => roundOfDay(rounds, day))).toEqual([3, 2, 3, 1]);
  });

  it("counts a day as done only in its current round, and keeps the round-1 rows", () => {
    const rounds = weekRounds([{ round: 1, repeatWeeks: [2], recordedAt: T1 }]);
    const rows = [
      ...range(1, 10).map((day) => ({ day, round: 1, completedAt: T0 })),
      { day: 6, round: 2, completedAt: T2 },
      { day: 7, round: 2, completedAt: null },
    ];
    expect([...doneInCurrentRound(rows, rounds)].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
    const attempts = [
      { day: 10, round: 1, passed: true },
      { day: 5, round: 1, passed: true },
    ];
    expect(inCurrentRound(attempts, rounds)).toEqual([{ day: 5, round: 1, passed: true }]);
  });

  it("ignores an 'Open Day N' made before the day's round opened", () => {
    const rounds = weekRounds([{ round: 1, repeatWeeks: [3], recordedAt: T1 }]);
    const opened = openedInCurrentRound(
      [
        { day: 11, createdAt: T0 },
        { day: 12, createdAt: T2 },
        { day: 21, createdAt: T0 },
      ],
      rounds,
    );
    expect([...opened].sort((a, b) => a - b)).toEqual([12, 21]);
  });

  it("lists a week's days", () => {
    expect(daysOfWeek(3)).toEqual([11, 12, 13, 14, 15]);
  });
});

describe("day status with a repeat (Weeks 2–3 in round 2)", () => {
  const rounds = weekRounds([{ round: 1, repeatWeeks: [2, 3], recordedAt: T1 }]);
  const roundOne = range(1, 20).map((day) => ({ day, round: 1, completedAt: T0 }));
  const input = (rows: typeof roundOne, passed: number[]): DayStatusInput => ({
    today: "2026-10-09",
    startDate: "2026-09-01",
    doneDays: doneInCurrentRound(rows, rounds),
    readyDays: new Set(range(1, 65)),
    checkpoints: {
      assessmentsPassed: new Set(passed),
      scorecardsSubmitted: new Set([...doneInCurrentRound(rows, rounds)].filter((d) => d % 5 === 0)),
      gatesPassed: new Set(),
    },
  });

  it("reopens Day 6 and locks the rest of the repeat in order; other days stay done", () => {
    const states = dayStates(input(roundOne, [5, 20]));
    expect(states.slice(0, 5).every((s) => s.status === "done")).toBe(true);
    expect(states[5]).toEqual({ day: 6, status: "open", lockReason: null });
    expect(states[6]).toEqual({ day: 7, status: "locked", lockReason: "previous_day" });
    expect(states.slice(15, 20).every((s) => s.status === "done")).toBe(true);
    expect(states[20]).toEqual({ day: 21, status: "locked", lockReason: "gate" });
  });

  it("needs the Week 2 assessment again in round 2 before Day 11", () => {
    const rows = [...roundOne, ...range(6, 10).map((day) => ({ day, round: 2, completedAt: T2 }))];
    expect(dayStates(input(rows, [5, 20]))[10]).toMatchObject({ day: 11, lockReason: "assessment" });
    expect(dayStates(input(rows, [5, 10, 20]))[10]).toMatchObject({ day: 11, status: "open" });
  });
});
