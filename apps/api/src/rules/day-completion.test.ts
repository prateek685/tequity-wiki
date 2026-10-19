import { describe, expect, it } from "vitest";
import { canStartQuiz, hasDailyQuiz, isDayComplete, quizStatus } from "./day-completion.js";

const IDS = ["meet-carebook", "pillars", "call", "reflect"];

describe("day completion", () => {
  it("needs every lesson, then the quiz", () => {
    const done = new Set(IDS);
    expect(isDayComplete({ day: 3, lessonIds: IDS, doneIds: done, quizCompleted: false })).toBe(false);
    expect(isDayComplete({ day: 3, lessonIds: IDS, doneIds: done, quizCompleted: true })).toBe(true);
  });

  it("is not complete with a missing lesson even if the quiz is done", () => {
    const done = new Set(IDS.slice(0, 3));
    expect(isDayComplete({ day: 3, lessonIds: IDS, doneIds: done, quizCompleted: true })).toBe(false);
  });

  it("completes Day 65 (no quiz) when its lessons are done", () => {
    expect(hasDailyQuiz(65)).toBe(false);
    expect(hasDailyQuiz(64)).toBe(true);
    expect(isDayComplete({ day: 65, lessonIds: IDS, doneIds: new Set(IDS), quizCompleted: false })).toBe(
      true,
    );
  });
});

describe("quiz status", () => {
  const base = { day: 1, lessonsDone: false, unlockAll: false, attempt: null, poolReady: true };

  it("is locked until the lessons are done, then ready or not_ready", () => {
    expect(quizStatus(base)).toBe("locked");
    expect(quizStatus({ ...base, lessonsDone: true })).toBe("ready");
    expect(quizStatus({ ...base, lessonsDone: true, poolReady: false })).toBe("not_ready");
  });

  it("is never locked while unlockAll is on", () => {
    expect(canStartQuiz(false, true)).toBe(true);
    expect(canStartQuiz(false, false)).toBe(false);
    expect(quizStatus({ ...base, unlockAll: true })).toBe("ready");
  });

  it("follows the attempt once started", () => {
    expect(quizStatus({ ...base, attempt: { completed: false } })).toBe("in_progress");
    expect(quizStatus({ ...base, attempt: { completed: true } })).toBe("done");
  });

  it("is none on Day 65", () => {
    expect(quizStatus({ ...base, day: 65, lessonsDone: true })).toBe("none");
  });
});
