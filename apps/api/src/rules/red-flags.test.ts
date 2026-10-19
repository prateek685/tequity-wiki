import { type PillarScores } from "@portal/contracts";
import { describe, expect, it } from "vitest";
import {
  addDays,
  avoidingLive,
  fewPracticeDays,
  gateNotPassed,
  pillarLow,
  type RedFlagInput,
  redFlagSignals,
  scorecardMissing,
  selfVsGate,
  unpausedDaysSince,
} from "./red-flags.js";

const TODAY = "2026-10-20";
const names = { understand: "Understand", communicate: "Communicate", own: "Own", stand_firm: "Stand firm" };
const scores = (values: Partial<PillarScores> = {}): PillarScores => ({
  understand: 3,
  communicate: 3,
  own: 3,
  stand_firm: 3,
  ...values,
});

/** Practice on every day of the last 14 (no practice flag) unless a test says otherwise. */
const everyDay = new Set(Array.from({ length: 30 }, (_, i) => addDays(TODAY, -i)));

const base: RedFlagInput = {
  today: TODAY,
  startDate: "2026-09-01",
  pauses: [],
  day5DoneOn: "2026-09-06",
  lastScorecard: { on: "2026-10-15", week: 6 },
  scorecards: [1, 2, 3, 4, 5, 6].map((week) => ({ week, scores: scores() })),
  gates: [],
  practiceDays: everyDay,
  liveAvoided: [],
  pillarNames: names,
};
const input = (over: Partial<RedFlagInput>): RedFlagInput => ({ ...base, ...over });

describe("dates", () => {
  it("counts days after `from` up to `to`, without pause days", () => {
    expect(unpausedDaysSince("2026-10-01", "2026-10-15", [])).toBe(14);
    expect(unpausedDaysSince("2026-10-01", "2026-10-15", [{ from: "2026-10-05", to: "2026-10-07" }])).toBe(
      11,
    );
    expect(unpausedDaysSince("2026-10-15", "2026-10-15", [])).toBe(0);
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });
});

describe("scorecard_missing", () => {
  it("raises after 14 days without a new scorecard, not at 13", () => {
    expect(scorecardMissing(input({ lastScorecard: { on: addDays(TODAY, -13), week: 4 } }))).toEqual([]);
    expect(scorecardMissing(input({ lastScorecard: { on: addDays(TODAY, -14), week: 4 } }))).toEqual([
      { kind: "scorecard_missing", key: "", detail: "No new scorecard for 14 days (last: Week 4)" },
    ]);
  });

  it("doesn't count pause days", () => {
    const paused = input({
      lastScorecard: { on: addDays(TODAY, -16), week: 4 },
      pauses: [{ from: addDays(TODAY, -10), to: addDays(TODAY, -8) }],
    });
    expect(scorecardMissing(paused)).toEqual([]);
  });

  it("waits for Day 5, then counts from it when there's no scorecard", () => {
    expect(scorecardMissing(input({ day5DoneOn: null, lastScorecard: null }))).toEqual([]);
    expect(scorecardMissing(input({ day5DoneOn: addDays(TODAY, -20), lastScorecard: null }))).toEqual([
      { kind: "scorecard_missing", key: "", detail: "No new scorecard for 20 days" },
    ]);
  });
});

describe("pillar_low", () => {
  it("raises when a pillar is 2 or below on the last 3 scorecards, carried values included", () => {
    const cards = [
      { week: 3, scores: scores({ stand_firm: 3 }) },
      { week: 4, scores: scores({ stand_firm: 2, own: 2 }) },
      // Week 5 didn't rate Stand firm: the 2 carries forward and counts.
      { week: 5, scores: scores({ stand_firm: 2, own: 3 }) },
      { week: 6, scores: scores({ stand_firm: 1.5, own: 2 }) },
    ];
    expect(pillarLow(input({ scorecards: cards }))).toEqual([
      { kind: "pillar_low", key: "stand_firm", detail: "Stand firm: 2, 2, 1.5 (Weeks 4–6)" },
    ]);
  });

  it("needs 3 scorecards, and clears once the latest goes above 2", () => {
    const low = scores({ understand: 2 });
    expect(pillarLow(input({ scorecards: [1, 2].map((week) => ({ week, scores: low })) }))).toEqual([]);
    expect(
      pillarLow(
        input({
          scorecards: [
            { week: 1, scores: low },
            { week: 2, scores: low },
            { week: 3, scores: low },
            { week: 4, scores: scores({ understand: 2.5 }) },
          ],
        }),
      ),
    ).toEqual([]);
    expect(pillarLow(input({ scorecards: [1, 2, 3].map((week) => ({ week, scores: low })) }))).toEqual([
      expect.objectContaining({ key: "understand" }),
    ]);
  });

  it("ignores pillars without a score", () => {
    const empty = scores({ own: null });
    expect(pillarLow(input({ scorecards: [1, 2, 3].map((week) => ({ week, scores: empty })) }))).toEqual([]);
  });
});

describe("self_vs_gate", () => {
  const gate = (round: number, pillarAverages: RedFlagInput["gates"][number]["pillarAverages"]) => ({
    gate: 1 as const,
    round,
    outcome: "pass" as const,
    pillarAverages,
  });

  it("compares the latest gate round with the Week 4 scorecard, per pillar", () => {
    const cards = [{ week: 4, scores: scores({ own: 4, understand: 2 }) }];
    expect(
      selfVsGate(input({ scorecards: cards, gates: [gate(1, { own: 2, understand: 3.5, communicate: 3 })] })),
    ).toEqual([{ kind: "self_vs_gate", key: "gate1-round1", detail: "Gate 1: Own self 4 vs gate 2" }]);
    // A gap of 1.5 isn't enough; the latest round counts.
    expect(
      selfVsGate(input({ scorecards: cards, gates: [gate(1, { own: 1 }), gate(2, { own: 2.5 })] })),
    ).toEqual([]);
  });

  it("uses Week 8 for Gate 2 and needs that week's scorecard", () => {
    const g2 = { gate: 2 as const, round: 1, outcome: "pass" as const, pillarAverages: { communicate: 5 } };
    expect(selfVsGate(input({ gates: [g2] }))).toEqual([]);
    expect(
      selfVsGate(input({ gates: [g2], scorecards: [{ week: 8, scores: scores({ communicate: 3 }) }] })),
    ).toEqual([
      { kind: "self_vs_gate", key: "gate2-round1", detail: "Gate 2: Communicate self 3 vs gate 5" },
    ]);
  });
});

describe("few_practice_days", () => {
  const days = (...ago: number[]) => new Set(ago.map((n) => addDays(TODAY, -n)));

  it("raises with fewer than 3 practice days in each of the last 2 seven-day periods", () => {
    // Period 1 = 1–7 days ago, period 2 = 8–14 days ago; today doesn't count.
    expect(fewPracticeDays(input({ practiceDays: days(0, 0, 1, 3, 8, 9) })).signals).toEqual([
      { kind: "few_practice_days", key: "", detail: "Practice days in the last two weeks: 2 and 2" },
    ]);
  });

  it("doesn't raise when either period has 3", () => {
    expect(fewPracticeDays(input({ practiceDays: days(1, 2, 3, 8) })).signals).toEqual([]);
    expect(fewPracticeDays(input({ practiceDays: days(1, 8, 9, 14) })).signals).toEqual([]);
  });

  it("holds the flag when a period overlaps a pause, and waits for two periods after the start", () => {
    const paused = fewPracticeDays(
      input({ practiceDays: days(), pauses: [{ from: addDays(TODAY, -20), to: addDays(TODAY, -12) }] }),
    );
    expect(paused).toEqual({ signals: [], hold: [{ kind: "few_practice_days", key: "" }] });
    expect(fewPracticeDays(input({ practiceDays: days(), startDate: addDays(TODAY, -13) }))).toEqual({
      signals: [],
      hold: [],
    });
    expect(
      fewPracticeDays(input({ practiceDays: days(), startDate: addDays(TODAY, -14) })).signals,
    ).toHaveLength(1);
  });
});

describe("gate_not_passed", () => {
  it("raises one flag per gate round recorded as repeat", () => {
    const gates = [
      { gate: 1 as const, round: 2, outcome: "pass" as const, pillarAverages: {} },
      { gate: 1 as const, round: 1, outcome: "repeat" as const, pillarAverages: {} },
    ];
    expect(gateNotPassed(input({ gates }))).toEqual([
      { kind: "gate_not_passed", key: "gate1-round1", detail: "Gate 1, round 1" },
    ]);
  });
});

describe("redFlagSignals", () => {
  it("is quiet for an engineer on track", () => {
    expect(redFlagSignals(base)).toEqual({ signals: [], hold: [] });
  });

  it("collects every rule and never raises avoiding_live", () => {
    const result = redFlagSignals(
      input({
        lastScorecard: { on: addDays(TODAY, -20), week: 2 },
        practiceDays: new Set(),
        gates: [{ gate: 1, round: 1, outcome: "repeat", pillarAverages: {} }],
      }),
    );
    expect(result.signals.map((signal) => signal.kind)).toEqual([
      "scorecard_missing",
      "few_practice_days",
      "gate_not_passed",
    ]);
  });
});

describe("avoiding_live", () => {
  it("raises one flag at 2 deferrals or substitutes", () => {
    expect(avoidingLive(input({ liveAvoided: [{ day: 43, how: "deferred" }] }))).toEqual([]);
    expect(
      avoidingLive(
        input({
          liveAvoided: [
            { day: 43, how: "deferred" },
            { day: 48, how: "substitute" },
          ],
        }),
      ),
    ).toEqual([{ kind: "avoiding_live", key: "phase3", detail: "Day 43 (later), Day 48 (substitute)" }]);
  });
});
