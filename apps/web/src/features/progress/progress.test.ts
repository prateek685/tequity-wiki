import { type JournalEntry, type WeeklyScorecard } from "@portal/contracts";
import { describe, expect, it } from "vitest";
import {
  assessmentTile,
  axisWeeks,
  CHART,
  chartScale,
  chartWeeks,
  dayOneRows,
  journalDays,
  paceLine,
  pillarSeries,
  rubricPercent,
  scoreText,
  weekLabel,
  writingTile,
} from "./progress";

const card = (
  week: number,
  scores: WeeklyScorecard["scores"],
  rated: WeeklyScorecard["rated"],
): WeeklyScorecard => ({
  week,
  day: week * 5,
  scores,
  rated,
  daysCompleted: 5,
  mocksDone: 4,
});

describe("progress tiles", () => {
  it("writes the pace line and the assessments tile", () => {
    expect(paceLine({ done: 4, total: 65, pace: "on_pace", targetDate: "2027-02-02" })).toBe(
      "On pace · finish by 2 Feb 2027",
    );
    expect(paceLine({ done: 0, total: 65, pace: null, targetDate: "2027-02-02" })).toBe(
      "Finish by 2 Feb 2027",
    );
    expect(assessmentTile({ passed: 0, taken: 0, averagePercent: null })).toEqual({
      value: "—",
      sub: "First one after Day 5",
    });
    expect(assessmentTile({ passed: 5, taken: 5, averagePercent: 74 })).toEqual({
      value: "5 / 5",
      sub: "Passed · avg 74%",
    });
    expect(assessmentTile({ passed: 1, taken: 2, averagePercent: 55 }).sub).toBe("1 to pass · avg 55%");
  });

  it("formats scores and rubric bars", () => {
    expect(scoreText(null)).toBe("—");
    expect(scoreText(3)).toBe("3.0");
    expect(rubricPercent(null)).toBe(0);
    expect(rubricPercent(3.4)).toBe(68);
    expect(rubricPercent(5)).toBe(100);
    expect(dayOneRows(null, { understand: 3, communicate: null, own: 2.5, stand_firm: 1 })[0]).toEqual({
      pillar: "understand",
      name: "Understand",
      dayOne: "—",
      now: "3.0",
    });
  });
});

describe("pillar chart", () => {
  it("labels weeks and spans at least five", () => {
    expect(weekLabel(1)).toBe("Days 1–5");
    expect(weekLabel(2)).toBe("6–10");
    expect(chartWeeks([])).toBe(5);
    expect(chartWeeks([{ week: 2 }])).toBe(5);
    expect(chartWeeks([{ week: 9 }])).toBe(9);
    expect(axisWeeks(5)).toEqual([1, 2, 3, 4, 5]);
    expect(axisWeeks(9)).toEqual([1, 3, 5, 7, 9]);
    expect(axisWeeks(13, 340)).toEqual([1, 5, 9, 13]);
  });

  it("scales weeks to x and scores to y inside the plot", () => {
    const { x, y } = chartScale(5);
    expect(x(1)).toBe(CHART.left);
    expect(x(5)).toBe(CHART.width - CHART.right);
    expect(y(5)).toBe(CHART.top);
    expect(y(1)).toBe(CHART.height - CHART.bottom);
  });

  it("draws carried-forward points hollow, reached by a dashed segment", () => {
    const scores = (u: number | null) => ({ understand: u, communicate: 2, own: null, stand_firm: 2 });
    const series = pillarSeries(
      [card(2, scores(3), ["communicate"]), card(1, scores(2), ["understand", "communicate"])],
      5,
    );
    const understand = series.find((line) => line.pillar === "understand");
    expect(understand?.points.map((point) => [point.week, point.score, point.carried])).toEqual([
      [1, 2, false],
      [2, 3, true],
    ]);
    expect(understand?.segments.map((segment) => segment.dashed)).toEqual([true]);
    const communicate = series.find((line) => line.pillar === "communicate");
    expect(communicate?.segments.map((segment) => segment.dashed)).toEqual([false]);
    // No score yet: no points and no line.
    expect(series.find((line) => line.pillar === "own")?.points).toEqual([]);
  });
});

describe("journal", () => {
  const entry = (day: number, label: string): JournalEntry => ({
    day,
    storyDate: `Day ${day} date`,
    lessonId: "reflect",
    lessonTitle: "Reflect",
    label,
    text: "…",
    savedAt: "2026-10-01T10:00:00.000Z",
  });

  it("groups entries by day, newest day first, keeping lesson order", () => {
    const groups = journalDays([entry(1, "Went well"), entry(2, "Goal"), entry(1, "Fix next time")]);
    expect(groups.map((group) => group.day)).toEqual([2, 1]);
    expect(groups[1]?.entries.map((item) => item.label)).toEqual(["Went well", "Fix next time"]);
    expect(journalDays([])).toEqual([]);
  });
});

describe("writing tile", () => {
  it("shows the AI average and how many write tasks it's from", () => {
    expect(writingTile({ average: 3.8, count: 7 })).toEqual({
      value: "3.8",
      sub: "AI average · from 7 write tasks",
    });
    expect(writingTile({ average: 4, count: 1 }).sub).toBe("AI average · from 1 write task");
    expect(writingTile(null).value).toBeNull();
    expect(writingTile(null, false).sub).toBe("After the first scored write task");
  });
});
