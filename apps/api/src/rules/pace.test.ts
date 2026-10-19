import { describe, expect, it } from "vitest";
import { computePace, type PaceInput, pauseDaysSoFar } from "./pace.js";

function input(overrides: Partial<PaceInput> = {}): PaceInput {
  return {
    today: "2026-10-30",
    startDate: "2026-10-01",
    targetDate: "2026-12-30",
    pauses: [],
    daysDone: 0,
    targetDays: 90,
    toleranceDays: 3,
    ...overrides,
  };
}

describe("pace", () => {
  it("is not_started before the start date", () => {
    expect(computePace(input({ today: "2026-09-30" }))).toMatchObject({
      status: "not_started",
      expectedDone: 0,
      difference: 0,
    });
  });

  it("counts the start date as day 1 of elapsed time", () => {
    // 1 elapsed day of 90 → floor(65 / 90) = 0 expected.
    expect(computePace(input({ today: "2026-10-01" }))).toMatchObject({ status: "on_pace", expectedDone: 0 });
  });

  it("expects floor(65 × elapsed / targetDays) days done", () => {
    // 30 elapsed days → floor(65 × 30 / 90) = 21.
    const pace = computePace(input({ daysDone: 18 }));
    expect(pace).toMatchObject({ expectedDone: 21, difference: 3, status: "on_pace" });
    expect(computePace(input({ daysDone: 17 }))).toMatchObject({ difference: 4, status: "behind" });
    expect(computePace(input({ daysDone: 22 }))).toMatchObject({ difference: -1, status: "ahead" });
  });

  it("never expects more than 65 days", () => {
    expect(computePace(input({ today: "2027-06-01", daysDone: 65 }))).toMatchObject({
      expectedDone: 65,
      status: "on_pace",
    });
  });

  it("subtracts pause days so far, ignoring future pause days", () => {
    const pauses = [
      { from: "2026-10-10", to: "2026-10-14" }, // 5 days, all past
      { from: "2026-10-29", to: "2026-11-05" }, // 2 days so far (29, 30)
    ];
    expect(pauseDaysSoFar(pauses, "2026-10-01", "2026-10-30")).toBe(7);
    // 30 − 7 = 23 elapsed → floor(65 × 23 / 90) = 16.
    expect(computePace(input({ pauses, daysDone: 16 }))).toMatchObject({
      expectedDone: 16,
      status: "on_pace",
    });
  });

  it("uses the target length and tolerance from settings", () => {
    expect(computePace(input({ targetDays: 60, daysDone: 30 }))).toMatchObject({
      expectedDone: 32,
      status: "on_pace",
    });
    expect(computePace(input({ toleranceDays: 0, daysDone: 20 }))).toMatchObject({ status: "behind" });
  });
});
