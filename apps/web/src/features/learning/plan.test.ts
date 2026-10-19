import { describe, expect, it } from "vitest";
import { formatDate } from "@/lib/dates";
import {
  blockDays,
  blockLabel,
  checkInDetail,
  checkpointsAfter,
  expectedDate,
  greeting,
  blockLine,
  lockMessage,
  nextCheckInDay,
  paceLabel,
  pauseDays,
  phaseLabel,
  phaseOf,
  pillarAverages,
  safetyReminders,
} from "./plan";

describe("plan display rules", () => {
  it("maps days to phases", () => {
    expect([1, 20, 21, 40, 41, 65].map(phaseOf)).toEqual([1, 1, 2, 2, 3, 3]);
  });

  it("shows blocks as day ranges, never weeks", () => {
    expect(blockDays(1)).toEqual({ first: 1, last: 5 });
    expect(blockLabel(13)).toBe("Days 61–65");
    expect(blockLine({ number: 1, title: "Baseline and structured speaking" })).toBe(
      "Days 1–5 · Baseline and structured speaking",
    );
  });

  it("lists checkpoints between days", () => {
    const kinds = (day: number) => checkpointsAfter(day).map((checkpoint) => checkpoint.kind);
    expect(kinds(4)).toEqual([]);
    expect(kinds(5)).toEqual(["assessment"]);
    expect(checkpointsAfter(5)[0]?.title).toBe("Assessment · Days 1–5 + scorecard");
    expect(kinds(10)).toEqual(["assessment", "checkin"]);
    expect(kinds(20)).toEqual(["assessment", "gate"]);
    expect(checkpointsAfter(40)[1]?.title).toBe("Gate 2");
    expect(kinds(60)).toEqual(["assessment", "checkin"]);
    expect(kinds(65)).toEqual([]);
    expect(nextCheckInDay(1)).toBe(10);
    expect(nextCheckInDay(61)).toBeNull();
  });

  it("asks the engineer to book check-ins and gates, with the expected date while it's ahead", () => {
    const enrollment = { startDate: "2026-10-01", targetDate: "2026-12-30" }; // 90 days
    expect(expectedDate(65, enrollment)).toBe("2026-12-30");
    expect(expectedDate(10, enrollment)).toBe("2026-10-15"); // 10 × 90 / 65 ≈ 14 days
    expect(checkInDetail(10)).toBe("Book it with your manager");
    expect(checkInDetail(10, enrollment, "2026-10-09")).toBe(
      `Book it with your manager · around ${formatDate("2026-10-15")}`,
    );
    expect(checkInDetail(10, enrollment, "2026-10-20")).toBe("Book it with your manager");
    expect(checkpointsAfter(20)[1]?.detail).toBe(
      "Book a 45-minute live call with your manager · Day 21 opens after a pass",
    );
  });

  it("names phases, greets by time of day and counts pause days", () => {
    expect(phaseLabel(2)).toBe("Phase 1 · Foundation");
    expect(phaseLabel(41)).toBe("Phase 3 · Live reps");
    expect(greeting(new Date(2026, 9, 7, 8))).toBe("Good morning");
    expect(greeting(new Date(2026, 9, 7, 13))).toBe("Good afternoon");
    expect(greeting(new Date(2026, 9, 7, 19))).toBe("Good evening");
    expect(pauseDays("2026-11-04", "2027-02-02")).toBe(0);
    expect(pauseDays("2026-11-04", "2027-02-05")).toBe(3);
  });

  it("explains each lock reason in plain words", () => {
    expect(lockMessage("start_date", 1, "2026-11-04")).toBe("Day 1 opens on your start date, 4 Nov 2026.");
    expect(lockMessage("previous_day", 3)).toBe("Finish Day 2 to open this day.");
    expect(lockMessage("assessment", 6)).toBe("Pass the assessment after Day 5 to open this day.");
    expect(lockMessage("scorecard", 11)).toBe("Submit your scorecard for Days 6–10 to open this day.");
    expect(lockMessage("gate", 21)).toBe("Pass Gate 1 to open this day.");
    expect(lockMessage("gate", 41)).toBe("Pass Gate 2 to open this day.");
  });

  it("writes the pace note", () => {
    const pace = { daysDone: 4, expectedDone: 4, targetDate: "2027-01-01" };
    expect(paceLabel({ ...pace, status: "on_pace", difference: 2 })).toBe("On pace");
    expect(paceLabel({ ...pace, status: "behind", difference: 4 })).toBe("4 days behind");
    expect(paceLabel({ ...pace, status: "ahead", difference: -1 })).toBe("1 day ahead");
  });

  it("picks the safety reminder by task source", () => {
    expect(safetyReminders("carebook")[0]).toMatch(/^Practice only/);
    expect(safetyReminders("real_project")[0]).toMatch(/^Real project is fine/);
    expect(safetyReminders("both")).toHaveLength(2);
  });

  it("averages the baseline per pillar", () => {
    const model = {
      pillars: [
        { id: "understand" as const, name: "Understand", summary: "." },
        { id: "own" as const, name: "Own", summary: "." },
      ],
      behaviours: [
        { id: "U1", pillar: "understand" as const, name: "a", soundsLike: ".", watchOut: "." },
        { id: "U2", pillar: "understand" as const, name: "b", soundsLike: ".", watchOut: "." },
        { id: "U3", pillar: "understand" as const, name: "c", soundsLike: ".", watchOut: "." },
        { id: "O1", pillar: "own" as const, name: "d", soundsLike: ".", watchOut: "." },
      ],
    };
    expect(pillarAverages(model, { U1: 2, U2: 3, U3: 3 })).toEqual([
      { id: "understand", name: "Understand", average: 2.7 },
      { id: "own", name: "Own", average: null },
    ]);
  });
});
