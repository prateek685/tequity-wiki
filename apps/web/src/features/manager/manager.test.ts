import { describe, expect, it } from "vitest";
import {
  averagePaceText,
  dayText,
  firstName,
  greeting,
  needsYou,
  paceText,
  pillarCells,
  RAG_PILL,
  reasonOk,
  taskTarget,
  todayIso,
  trackerPillars,
} from "./manager";

describe("Team page helpers", () => {
  it("writes pace as the mockup does", () => {
    expect(paceText(null)).toBe("—");
    expect(paceText({ status: "on_pace", difference: 0 })).toBe("On pace");
    expect(paceText({ status: "behind", difference: 6 })).toBe("6 days behind");
    expect(paceText({ status: "behind", difference: 1 })).toBe("1 day behind");
    expect(paceText({ status: "ahead", difference: -3 })).toBe("3 days ahead");
    expect(paceText({ status: "not_started", difference: 0 })).toBe("Not started");
  });

  it("shows the average pace with behind as minus", () => {
    expect(averagePaceText(null)).toBe("—");
    expect(averagePaceText(2)).toBe("−2 days");
    expect(averagePaceText(-3)).toBe("+3 days");
    expect(averagePaceText(0.4)).toBe("On pace");
    expect(averagePaceText(1)).toBe("−1 day");
  });

  it("adds up what needs the manager", () => {
    expect(needsYou({ checkinsDue: 2 })).toEqual({ value: 2, sub: "2 check-ins" });
    expect(needsYou({ checkinsDue: 0 })).toEqual({ value: 0, sub: "Nothing waiting" });
  });

  it("shows the day, pillars and names", () => {
    expect(dayText({ currentDay: 25, daysDone: 24 })).toBe("25 / 65");
    expect(dayText({ currentDay: null, daysDone: 65 })).toBe("65 / 65");
    expect(dayText({ currentDay: null, daysDone: 0 })).toBe("—");
    expect(
      pillarCells({ understand: 3, communicate: 2, own: 2.5, stand_firm: null }).map((cell) => [
        cell.text,
        cell.low,
      ]),
    ).toEqual([
      ["3", false],
      ["2", true],
      ["2.5", false],
      ["—", false],
    ]);
    expect(trackerPillars({ understand: 3, communicate: 4, own: 3, stand_firm: 1 })).toBe("3 · 4 · 3 · 1");
    expect(trackerPillars(null)).toBe("—");
    expect(firstName("Priya Rao")).toBe("Priya");
    expect(greeting(8)).toBe("Good morning");
    expect(greeting(14)).toBe("Good afternoon");
    expect(greeting(20)).toBe("Good evening");
  });

  it("maps check-in ratings to status pills", () => {
    expect(RAG_PILL.green).toMatchObject({ label: "On track", tone: "success" });
    expect(RAG_PILL.amber).toMatchObject({ label: "Needs focus", tone: "warning" });
    expect(RAG_PILL.red).toMatchObject({ label: "Off track", tone: "danger" });
  });

  it("routes task links", () => {
    expect(taskTarget("/manager/reviews/abc")).toBeNull();
    expect(taskTarget("/manager/engineers/e1/checkins/10")).toEqual({ kind: "checkin", id: "e1", day: 10 });
    expect(taskTarget("/manager/engineers/e1/gates/1")).toEqual({ kind: "gate", id: "e1", gate: 1 });
    expect(taskTarget("/manager/engineers/e1/gates/2")).toEqual({ kind: "gate", id: "e1", gate: 2 });
    expect(taskTarget("/manager/engineers/e1/gates/3")).toBeNull();
    expect(taskTarget("/manager/engineers/e1")).toEqual({ kind: "engineer", id: "e1" });
    expect(taskTarget("/elsewhere")).toBeNull();
  });

  it("needs a 5-character unlock reason", () => {
    expect(reasonOk("  ok  ")).toBe(false);
    expect(reasonOk("After our 1:1")).toBe(true);
  });

  it("formats today as a date input value", () => {
    expect(todayIso(new Date(2026, 9, 9, 15))).toBe("2026-10-09");
  });
});
