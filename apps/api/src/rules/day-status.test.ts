import { describe, expect, it } from "vitest";
import {
  type Checkpoints,
  currentDay,
  dayState,
  dayStates,
  type DayStatusInput,
  NO_CHECKPOINTS,
} from "./day-status.js";

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

function input(overrides: Partial<DayStatusInput> = {}): DayStatusInput {
  return {
    today: "2026-10-07",
    startDate: "2026-10-01",
    doneDays: new Set(),
    readyDays: new Set(range(1, 65)),
    checkpoints: NO_CHECKPOINTS,
    ...overrides,
  };
}

describe("day status", () => {
  it("locks Day 1 until the start date", () => {
    const future = input({ startDate: "2026-10-08" });
    expect(dayState(1, future)).toEqual({ day: 1, status: "locked", lockReason: "start_date" });
    expect(dayState(2, future)).toEqual({ day: 2, status: "locked", lockReason: "previous_day" });
    expect(currentDay(dayStates(future))).toBeNull();
  });

  it("opens Day 1 on the start date itself", () => {
    expect(dayState(1, input({ startDate: "2026-10-07" })).status).toBe("open");
  });

  it("opens the next day once the previous one is done", () => {
    const states = dayStates(input({ doneDays: new Set([1, 2]) }));
    expect(states.slice(0, 4).map((s) => s.status)).toEqual(["done", "done", "open", "locked"]);
    expect(states[3]?.lockReason).toBe("previous_day");
    expect(currentDay(states)).toBe(3);
  });

  it("keeps Day 6 locked after Day 5 until the assessment and scorecard are cleared", () => {
    const done = new Set(range(1, 5));
    expect(dayState(6, input({ doneDays: done }))).toMatchObject({
      status: "locked",
      lockReason: "assessment",
    });
    const passed: Checkpoints = { ...NO_CHECKPOINTS, assessmentsPassed: new Set([5]) };
    expect(dayState(6, input({ doneDays: done, checkpoints: passed }))).toMatchObject({
      lockReason: "scorecard",
    });
    const cleared: Checkpoints = { ...passed, scorecardsSubmitted: new Set([5]) };
    expect(dayState(6, input({ doneDays: done, checkpoints: cleared })).status).toBe("open");
  });

  it("needs Gate 1 after Day 20 and Gate 2 after Day 40, after that block's assessment", () => {
    const fives = new Set([5, 10, 15, 20, 25, 30, 35, 40]);
    const cleared: Checkpoints = {
      assessmentsPassed: fives,
      scorecardsSubmitted: fives,
      gatesPassed: new Set(),
    };
    expect(dayState(21, input({ doneDays: new Set(range(1, 20)), checkpoints: cleared })).lockReason).toBe(
      "gate",
    );
    const gate1 = { ...cleared, gatesPassed: new Set<1 | 2>([1]) };
    expect(dayState(21, input({ doneDays: new Set(range(1, 20)), checkpoints: gate1 })).status).toBe("open");
    expect(dayState(41, input({ doneDays: new Set(range(1, 40)), checkpoints: gate1 })).lockReason).toBe(
      "gate",
    );
  });

  it("has no checkpoint after Day 60's successors other than the assessment", () => {
    const done = new Set(range(1, 64));
    expect(dayState(65, input({ doneDays: done })).status).toBe("open");
  });

  it("marks an open day whose lesson isn't imported as not_ready, and it is not the current day", () => {
    const states = dayStates(input({ readyDays: new Set([2]) }));
    expect(states[0]).toEqual({ day: 1, status: "not_ready", lockReason: null });
    expect(currentDay(states)).toBeNull();
  });

  it("shows a done day as done even if its content is no longer ready", () => {
    expect(dayState(1, input({ doneDays: new Set([1]), readyDays: new Set() })).status).toBe("done");
  });

  it("returns all 65 days", () => {
    expect(dayStates(input())).toHaveLength(65);
  });

  it("opens every imported day while unlockAll is on, even before the start date", () => {
    const states = dayStates(
      input({
        startDate: "2026-12-01",
        unlockAll: true,
        readyDays: new Set([1, 2, 7]),
        doneDays: new Set([2]),
      }),
    );
    expect(states[0]).toEqual({ day: 1, status: "open", lockReason: null });
    expect(states[1]?.status).toBe("done");
    expect(states[6]?.status).toBe("open");
    expect(states[2]).toEqual({ day: 3, status: "not_ready", lockReason: null });
    expect(currentDay(states)).toBe(1);
  });

  it("opens a day a manager unlocked despite its lock, but never before the start date", () => {
    const done = new Set(range(1, 5));
    const opened = input({ doneDays: done, manuallyOpened: new Set([6]) });
    expect(dayState(6, opened)).toEqual({ day: 6, status: "open", lockReason: null });
    // Day 7 still waits for Day 6.
    expect(dayState(7, opened)).toEqual({ day: 7, status: "locked", lockReason: "previous_day" });
    // An unfinished earlier day doesn't matter either.
    expect(dayState(3, input({ manuallyOpened: new Set([3]) })).status).toBe("open");
    const early = input({ startDate: "2026-10-08", manuallyOpened: new Set([1]) });
    expect(dayState(1, early)).toEqual({ day: 1, status: "locked", lockReason: "start_date" });
    // An opened day that isn't imported is not_ready.
    expect(
      dayState(6, input({ doneDays: done, manuallyOpened: new Set([6]), readyDays: new Set() })).status,
    ).toBe("not_ready");
  });
});
