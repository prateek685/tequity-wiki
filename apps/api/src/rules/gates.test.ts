import { gateMaths, meetsBar, suggestRepeatWeeks } from "@portal/contracts";
import { describe, expect, it } from "vitest";
import {
  fullCriteria,
  gateDue,
  gateState,
  type GateStateInput,
  isRecapOpen,
  overrideNoteRequired,
  repeatProgress,
  repeatWeeksValid,
  weekPillars,
} from "./gates.js";

const state = (overrides: Partial<GateStateInput>) =>
  gateState({ reached: true, latest: null, recapRounds: new Set(), repeatComplete: false, ...overrides });

describe("gate status", () => {
  it("is locked until Day 20 is done, then to book, then recap sent", () => {
    expect(state({ reached: false })).toEqual({ status: "locked", round: 1 });
    expect(state({})).toEqual({ status: "to_book", round: 1 });
    expect(state({ recapRounds: new Set([1]) })).toEqual({ status: "recap_sent", round: 1 });
  });

  it("is passed or passed with focus once recorded", () => {
    expect(state({ latest: { round: 1, outcome: "pass" } })).toEqual({ status: "passed", round: 1 });
    expect(state({ latest: { round: 1, outcome: "pass_focus" } })).toEqual({
      status: "passed_focus",
      round: 1,
    });
  });

  it("is repeat until the reopened days are done again, then rerun as the next gate round", () => {
    const latest = { round: 1, outcome: "repeat" as const };
    expect(state({ latest, recapRounds: new Set([1]) })).toEqual({ status: "repeat", round: 1 });
    expect(state({ latest, repeatComplete: true })).toEqual({ status: "rerun", round: 2 });
    expect(state({ latest, repeatComplete: true, recapRounds: new Set([1, 2]) })).toEqual({
      status: "recap_sent",
      round: 2,
    });
    expect(state({ latest: { round: 2, outcome: "pass" } })).toEqual({ status: "passed", round: 2 });
  });

  it("lets the engineer write the recap only while the round isn't recorded", () => {
    expect(["to_book", "recap_sent", "rerun"].every((s) => isRecapOpen(s as never))).toBe(true);
    expect(["locked", "passed", "passed_focus", "repeat"].some((s) => isRecapOpen(s as never))).toBe(false);
  });
});

describe("gate outcome rules", () => {
  const good = { "1": 3, "2": 3, "3": 2, "7": null };
  const low = { "1": 3, "2": 1, "3": 4 };

  it("re-checks the bar with the contract maths (skipped criteria don't count)", () => {
    expect(gateMaths(good)).toEqual({ scored: 3, average: 2.67, lowest: 2 });
    expect(meetsBar(1, good, true)).toBe(true);
    expect(meetsBar(1, good, false)).toBe(false);
    expect(meetsBar(1, low, true)).toBe(false);
    expect(meetsBar(1, {}, true)).toBeNull();
  });

  it("needs an override note for a pass below the bar or a repeat at or above it", () => {
    expect(overrideNoteRequired("pass", true)).toBe(false);
    expect(overrideNoteRequired("pass_focus", true)).toBe(false);
    expect(overrideNoteRequired("pass", false)).toBe(true);
    expect(overrideNoteRequired("pass_focus", null)).toBe(true);
    expect(overrideNoteRequired("repeat", false)).toBe(false);
    expect(overrideNoteRequired("repeat", null)).toBe(false);
    expect(overrideNoteRequired("repeat", true)).toBe(true);
  });

  it("accepts exactly 2 different weeks of the gate", () => {
    expect(repeatWeeksValid(1, [2, 3])).toBe(true);
    expect(repeatWeeksValid(1, [1, 4])).toBe(true);
    expect(repeatWeeksValid(1, [2])).toBe(false);
    expect(repeatWeeksValid(1, [2, 2])).toBe(false);
    expect(repeatWeeksValid(1, [4, 5])).toBe(false);
    expect(repeatWeeksValid(2, [5, 8])).toBe(true);
  });

  it("stores all 11 criteria, null when they didn't come up", () => {
    expect(fullCriteria({ "1": 3, "11": 4, "7": null })).toEqual({
      1: 3,
      2: null,
      3: null,
      4: null,
      5: null,
      6: null,
      7: null,
      8: null,
      9: null,
      10: null,
      11: 4,
    });
  });
});

describe("gate weeks", () => {
  const behaviours = [
    { id: "C1", pillar: "communicate" as const },
    { id: "C4", pillar: "communicate" as const },
    { id: "O3", pillar: "own" as const },
    { id: "U1", pillar: "understand" as const },
  ];

  it("lists one pillar per scorecard behaviour, feeding suggestRepeatWeeks", () => {
    expect(weekPillars(["C1", "C4"], behaviours)).toEqual(["communicate", "communicate"]);
    expect(weekPillars(["C1", "O3", "X9"], behaviours)).toEqual(["communicate", "own"]);
    const weeks = [
      { week: 1, pillars: weekPillars(["C1", "C4"], behaviours) },
      { week: 2, pillars: weekPillars(["C4", "O3"], behaviours) },
      { week: 3, pillars: weekPillars(["U1"], behaviours) },
    ];
    expect(suggestRepeatWeeks({ communicate: 2, own: 1, understand: 4 }, weeks)).toEqual([1, 2]);
  });

  it("tracks the reopened days and their assessments", () => {
    const done = new Set([6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(repeatProgress([3, 2], done, new Set([10])).complete).toBe(false);
    const progress = repeatProgress([3, 2], done, new Set([10, 15]));
    expect(progress.complete).toBe(true);
    expect(progress.days.map((d) => d.day)).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(repeatProgress([2], new Set([6]), new Set()).days.filter((d) => d.done)).toHaveLength(1);
  });

  it("is due for 7 days after it's reached, then overdue", () => {
    expect(gateDue("2026-10-01", "2026-10-01")).toEqual({ status: "due", days: 7 });
    expect(gateDue("2026-10-01", "2026-10-08")).toEqual({ status: "due", days: 0 });
    expect(gateDue("2026-10-01", "2026-10-11")).toEqual({ status: "overdue", days: 3 });
  });
});

describe("Gate 2", () => {
  it("repeats 2 of Weeks 5–8 only", () => {
    expect(repeatWeeksValid(2, [5, 7])).toBe(true);
    expect(repeatWeeksValid(2, [4, 5])).toBe(false);
    expect(repeatWeeksValid(2, [8, 8])).toBe(false);
  });

  it("passes at average 3.0 with nothing below 2 and healthcare terms right; recap time doesn't count", () => {
    const criteria = { "1": 3, "2": 3, "3": 4, "4": 2 };
    expect(meetsBar(2, criteria, false, true)).toBe(true);
    expect(meetsBar(2, criteria, true, false)).toBe(false);
    expect(meetsBar(2, { ...criteria, "5": 1, "6": 5 }, true, true)).toBe(false);
    expect(meetsBar(2, { "1": 3, "2": 2 }, true, true)).toBe(false);
    // Against the bar → the manager needs an override note.
    expect(overrideNoteRequired("pass", meetsBar(2, criteria, true, false))).toBe(true);
    expect(overrideNoteRequired("repeat", meetsBar(2, criteria, true, true))).toBe(true);
  });

  it("goes from locked to to_book when Day 40 is done, and repeats like Gate 1", () => {
    expect(
      gateState({ reached: false, latest: null, recapRounds: new Set(), repeatComplete: false }),
    ).toEqual({ status: "locked", round: 1 });
    const latest = { round: 1, outcome: "repeat" as const };
    expect(gateState({ reached: true, latest, recapRounds: new Set(), repeatComplete: true })).toEqual({
      status: "rerun",
      round: 2,
    });
    const progress = repeatProgress(
      [6, 5],
      new Set([21, 22, 23, 24, 25, 26, 27, 28, 29, 30]),
      new Set([25, 30]),
    );
    expect(progress.days.map((d) => d.day)).toEqual([21, 22, 23, 24, 25, 26, 27, 28, 29, 30]);
    expect(progress.complete).toBe(true);
  });
});
