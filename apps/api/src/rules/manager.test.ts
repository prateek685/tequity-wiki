import { type WeeklyScorecard } from "@portal/contracts";
import { describe, expect, it } from "vitest";
import { dayStates, type DayStatusInput, NO_CHECKPOINTS } from "./day-status.js";
import {
  buildTracker,
  checkinDueDetail,
  checkinsDue,
  effectiveRetakeAt,
  nextCheckpoint,
  unlockOption,
} from "./manager.js";

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const NOW = new Date("2026-10-09T10:00:00Z");
const HOUR = 3_600_000;

function states(overrides: Partial<DayStatusInput> = {}) {
  return dayStates({
    today: "2026-10-09",
    startDate: "2026-10-01",
    doneDays: new Set(),
    readyDays: new Set(range(1, 65)),
    checkpoints: NO_CHECKPOINTS,
    ...overrides,
  });
}

describe("unlock option", () => {
  const ready = new Set(range(1, 65));

  it("offers the retake when the latest assessment failed and the wait isn't over", () => {
    const done = new Set(range(1, 5));
    const option = unlockOption({
      latestAssessment: { day: 5, completed: true, passed: false, retakeAt: new Date(NOW.getTime() + HOUR) },
      states: states({ doneDays: done }),
      readyDays: ready,
      now: NOW,
    });
    expect(option).toEqual({ kind: "retake_now", day: 5, label: "Allow the Week 1 assessment retake now" });
  });

  it("offers the next locked day once the retake is open (or the attempt passed or is running)", () => {
    const done = new Set(range(1, 5));
    const input = { states: states({ doneDays: done }), readyDays: ready, now: NOW };
    const waitOver = { day: 5, completed: true, passed: false, retakeAt: new Date(NOW.getTime() - HOUR) };
    expect(unlockOption({ ...input, latestAssessment: waitOver })).toEqual({
      kind: "next_day",
      day: 6,
      label: "Open Day 6",
    });
    const running = { day: 5, completed: false, passed: null, retakeAt: null };
    expect(unlockOption({ ...input, latestAssessment: running })?.kind).toBe("next_day");
  });

  it("opens the first locked day, whatever locks it", () => {
    // Day 1 open, Day 2 locked by the unfinished Day 1.
    expect(unlockOption({ latestAssessment: null, states: states(), readyDays: ready, now: NOW })).toEqual({
      kind: "next_day",
      day: 2,
      label: "Open Day 2",
    });
  });

  it("offers nothing before the start date, for a day not imported, or with every day open", () => {
    const early = states({ startDate: "2026-10-20" });
    expect(unlockOption({ latestAssessment: null, states: early, readyDays: ready, now: NOW })).toBeNull();
    expect(
      unlockOption({ latestAssessment: null, states: states(), readyDays: new Set([1]), now: NOW }),
    ).toBeNull();
    const all = states({ unlockAll: true });
    expect(unlockOption({ latestAssessment: null, states: all, readyDays: ready, now: NOW })).toBeNull();
  });
});

describe("effective retake time", () => {
  const completed = new Date(NOW.getTime() - 2 * HOUR);
  const retakeAt = new Date(NOW.getTime() + 20 * HOUR);

  it("opens the retake at the unlock time when unlocked after the attempt finished", () => {
    expect(effectiveRetakeAt(retakeAt, completed, NOW)).toEqual(NOW);
  });

  it("ignores an unlock from before the attempt, and one after the wait was over anyway", () => {
    expect(effectiveRetakeAt(retakeAt, completed, new Date(completed.getTime() - HOUR))).toEqual(retakeAt);
    const early = new Date(NOW.getTime() - HOUR);
    expect(effectiveRetakeAt(early, completed, NOW)).toEqual(early);
    expect(effectiveRetakeAt(retakeAt, completed, null)).toEqual(retakeAt);
  });
});

describe("next checkpoint", () => {
  const none = {
    assessmentsPassed: new Set<number>(),
    checkins: new Set<number>(),
    gatesPassed: new Set<1 | 2>(),
  };

  it("ends with the final review: after Day 64, then to book", () => {
    const allDone = {
      doneDays: new Set(range(1, 64)),
      assessmentsPassed: new Set(range(1, 12).map((week) => week * 5)),
      checkins: new Set([10, 30, 50, 60]),
      gatesPassed: new Set<1 | 2>([1, 2]),
    };
    expect(nextCheckpoint({ ...allDone, finalReview: "locked" })).toBe("Final review after Day 64");
    expect(nextCheckpoint({ ...allDone, finalReview: "to_book" })).toBe("Final review to book");
    expect(nextCheckpoint({ ...allDone, finalReview: "recorded" })).toBeNull();
  });

  it("is the first uncleared checkpoint at or after the furthest day done", () => {
    expect(nextCheckpoint({ ...none, doneDays: new Set() })).toBe("Assessment after Day 5");
    expect(nextCheckpoint({ ...none, doneDays: new Set(range(1, 7)), assessmentsPassed: new Set([5]) })).toBe(
      "Assessment after Day 10",
    );
    expect(
      nextCheckpoint({ ...none, doneDays: new Set(range(1, 10)), assessmentsPassed: new Set([5, 10]) }),
    ).toBe("Check-in after Day 10");
    expect(
      nextCheckpoint({
        ...none,
        doneDays: new Set(range(1, 20)),
        assessmentsPassed: new Set([5, 10, 15, 20]),
        checkins: new Set([10]),
      }),
    ).toBe("Gate 1 after Day 20");
  });

  it("looks forward: a missed check-in behind the engineer is a task, not the next checkpoint", () => {
    expect(
      nextCheckpoint({ ...none, doneDays: new Set(range(1, 12)), assessmentsPassed: new Set([5, 10]) }),
    ).toBe("Assessment after Day 15");
  });

  it("puts a failed assessment's retake first, then a gate to book or record", () => {
    const done = { ...none, doneDays: new Set(range(1, 12)), assessmentsPassed: new Set([5]) };
    expect(nextCheckpoint({ ...done, assessmentsFailed: new Set([10]) })).toBe("Week 2 assessment retake");
    const gateDone = {
      ...none,
      doneDays: new Set(range(1, 20)),
      assessmentsPassed: new Set([5, 10, 15, 20]),
      checkins: new Set([10]),
    };
    expect(nextCheckpoint({ ...gateDone, gates: [{ gate: 1, status: "to_book" }] })).toBe("Gate 1 to book");
    expect(nextCheckpoint({ ...gateDone, gates: [{ gate: 1, status: "rerun" }] })).toBe("Gate 1 to book");
    expect(nextCheckpoint({ ...gateDone, gates: [{ gate: 1, status: "recap_sent" }] })).toBe(
      "Gate 1 to record",
    );
  });

  it("during a repeat, points at the reopened weeks' first checkpoint", () => {
    // Weeks 2–3 reopened: Days 6–15 aren't done in round 2, the round-2 assessments aren't passed.
    const repeat = {
      ...none,
      doneDays: new Set([...range(1, 5), ...range(16, 20)]),
      assessmentsPassed: new Set([5, 20]),
      checkins: new Set([10]),
      gates: [{ gate: 1 as const, status: "repeat" as const }],
    };
    expect(nextCheckpoint(repeat)).toBe("Assessment after Day 10");
  });

  it("is null after the last checkpoint", () => {
    const passed = new Set(range(1, 12).map((week) => week * 5));
    const progress = {
      doneDays: new Set(range(1, 61)),
      assessmentsPassed: passed,
      checkins: new Set([10, 30, 50, 60]),
      gatesPassed: new Set<1 | 2>([1, 2]),
    };
    expect(nextCheckpoint(progress)).toBeNull();
  });
});

describe("check-ins due", () => {
  it("lists reached check-in days without a check-in: due for 7 days, then overdue", () => {
    const completedOn = new Map([
      [10, "2026-09-20"],
      [30, "2026-10-06"],
      [50, "2026-10-09"],
    ]);
    const due = checkinsDue({ completedOn, recorded: new Set(), today: "2026-10-09" });
    expect(due).toEqual([
      { day: 10, status: "overdue", days: 12 },
      { day: 30, status: "due", days: 4 },
      { day: 50, status: "due", days: 7 },
    ]);
    expect(due.map(checkinDueDetail)).toEqual([
      "After Day 10 · overdue 12 days",
      "After Day 30 · due in 4 days",
      "After Day 50 · due in 7 days",
    ]);
    expect(checkinDueDetail({ day: 10, status: "due", days: 0 })).toBe("After Day 10 · due today");
    expect(checkinDueDetail({ day: 10, status: "overdue", days: 1 })).toBe("After Day 10 · overdue 1 day");
  });

  it("skips recorded check-ins and days not completed", () => {
    const completedOn = new Map([[10, "2026-10-01"]]);
    expect(checkinsDue({ completedOn, recorded: new Set([10]), today: "2026-10-09" })).toEqual([]);
    expect(checkinsDue({ completedOn: new Map(), recorded: new Set(), today: "2026-10-09" })).toEqual([]);
  });
});

describe("tracker", () => {
  const scores = { understand: 3, communicate: 2.5, own: null, stand_firm: 2 };
  const card = (week: number): WeeklyScorecard => ({
    week,
    day: week * 5,
    scores,
    rated: ["understand"],
    daysCompleted: 5,
    mocksDone: 1,
  });

  it("has 13 weeks with days done, scorecards, checkpoints and the check-in's RAG and note", () => {
    const tracker = buildTracker({
      doneDays: new Set([...range(1, 10), 11, 64]),
      scorecards: [card(1), card(2)],
      checkins: [{ afterDay: 10, rag: "amber", note: "Slow on bad news." }],
    });
    expect(tracker).toHaveLength(13);
    expect(tracker[0]).toEqual({
      week: 1,
      daysDone: 5,
      pillars: scores,
      checkpoint: null,
      rag: null,
      note: null,
    });
    expect(tracker[1]).toEqual({
      week: 2,
      daysDone: 5,
      pillars: scores,
      checkpoint: "checkin",
      rag: "amber",
      note: "Slow on bad news.",
    });
    expect(tracker[2]).toMatchObject({ week: 3, daysDone: 1, pillars: null });
    expect(tracker.map((row) => row.checkpoint)).toEqual([
      null,
      "checkin",
      null,
      "gate1",
      null,
      "checkin",
      null,
      "gate2",
      null,
      "checkin",
      null,
      "checkin",
      "final",
    ]);
    expect(tracker[12]).toMatchObject({ week: 13, daysDone: 1 });
  });

  it("puts the latest Gate 1 result's RAG and note on Week 4", () => {
    const tracker = buildTracker({
      doneDays: new Set(range(1, 20)),
      scorecards: [],
      checkins: [],
      gates: [{ gate: 1, rag: "amber", note: "Repeat Weeks 2 and 3." }],
    });
    expect(tracker[3]).toMatchObject({
      week: 4,
      checkpoint: "gate1",
      rag: "amber",
      note: "Repeat Weeks 2 and 3.",
    });
    expect(tracker[7]).toMatchObject({ week: 8, rag: null });
  });
});
