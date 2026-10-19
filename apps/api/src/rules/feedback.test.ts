import { describe, expect, it } from "vitest";
import {
  assessmentFeedback,
  latestFeedback,
  mockFeedback,
  quizFeedback,
  rubricAverageText,
  writeFeedback,
  writingAverage,
} from "./feedback.js";

const at = (minute: number) => new Date(Date.UTC(2026, 9, 9, 10, minute));

describe("writingAverage", () => {
  it("averages the newest 10 scores to 1 decimal; null before the first", () => {
    expect(writingAverage([])).toBeNull();
    expect(writingAverage([4, 3, 3])).toEqual({ average: 3.3, count: 3 });
    expect(writingAverage([5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 1, 1])).toEqual({ average: 5, count: 10 });
  });
});

describe("feedback items", () => {
  it("mock: the fix-next line and the rubric average of the criteria that came up", () => {
    expect(rubricAverageText({ "1": 3, "2": null, "3": 2, "4": 3 })).toBe("2.7");
    expect(rubricAverageText({ "1": null })).toBeNull();
    const item = mockFeedback({
      day: 2,
      lessonId: "after-call",
      title: "Rapid-fire status questions",
      entry: { values: { "fix-next": " Answer first. " }, rubric: { "1": 3, "2": 4 } },
      at: at(0),
    });
    expect(item).toEqual({
      kind: "mock",
      day: 2,
      title: "Day 2 · Rapid-fire status questions",
      detail: "Fix next time: Answer first.",
      value: "3.5",
      href: "/app/day/2/after-call",
      at: at(0).toISOString(),
    });
    expect(
      mockFeedback({ day: 2, lessonId: "x", title: "T", entry: { values: {}, rubric: {} }, at: at(0) })
        .detail,
    ).toBe("Call scored");
  });

  it("quiz, assessment and write lines", () => {
    expect(quizFeedback({ day: 3, correct: 3, total: 4, at: at(1) })).toMatchObject({
      title: "Day 3 · Daily quiz",
      detail: "Multiple choice",
      value: "3/4",
      href: "/app/day/3/quiz",
    });
    expect(assessmentFeedback({ day: 10, correct: 6, total: 8, at: at(2) })).toMatchObject({
      day: 10,
      title: "Week 2 assessment",
      value: "6/8",
      href: "/app/assessment/10",
    });
    const base = { day: 4, lessonId: "rewrite", title: "Rewrite", at: at(3) };
    expect(writeFeedback({ ...base, score: 4, betterSentence: "Better." })).toMatchObject({
      title: "Day 4 · Rewrite",
      detail: "Better.",
      value: "4/5",
      href: "/app/day/4/rewrite",
    });
    expect(writeFeedback({ ...base, score: null, betterSentence: null })).toMatchObject({
      detail: "Being scored…",
      value: null,
    });
  });

  it("keeps the 4 newest", () => {
    const items = [0, 5, 2, 4, 1].map((minute) =>
      quizFeedback({ day: minute + 1, correct: 1, total: 1, at: at(minute) }),
    );
    expect(latestFeedback(items).map((item) => item.day)).toEqual([6, 5, 3, 2]);
  });
});
