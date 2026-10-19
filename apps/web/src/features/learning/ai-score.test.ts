import { AI_SCORE_POLL_MS, type AiScore, type FeedbackItem, type QuizItem } from "@portal/contracts";
import { describe, expect, it } from "vitest";
import {
  assessmentPending,
  dayPending,
  homePending,
  itemsPending,
  pollWhile,
  scoreLabel,
  scorePending,
  stayAfterSave,
} from "./ai-score";

const score = (status: AiScore["status"], value: number | null = null): AiScore => ({
  status,
  score: value,
  points: [],
  reason: null,
  betterSentence: null,
  possiblePhi: false,
  scoredAt: null,
});

const written = (aiScore: AiScore | null): QuizItem => ({
  position: 0,
  type: "written",
  stem: "Rewrite it.",
  clientLine: null,
  options: null,
  result: {
    choice: null,
    correct: null,
    correctIndex: null,
    explanations: [],
    text: "My answer",
    modelAnswer: "The model answer",
    scoreStatus: aiScore?.status === "scored" ? "scored" : "pending",
    aiScore,
  },
});

const feedback = (kind: FeedbackItem["kind"], value: string | null): FeedbackItem => ({
  kind,
  day: 1,
  title: "Day 1",
  detail: "",
  value,
  href: "/app",
  at: "2026-01-01T00:00:00.000Z",
});

describe("AI score polling", () => {
  it("polls only while something is pending", () => {
    expect(pollWhile(true)).toBe(AI_SCORE_POLL_MS);
    expect(pollWhile(false)).toBe(false);
    expect(scorePending(score("pending"))).toBe(true);
    expect(scorePending(score("scored", 4))).toBe(false);
    expect(scorePending(null)).toBe(false);
  });

  it("finds pending answers in quizzes, assessments, days and Home", () => {
    expect(itemsPending([written(score("scored", 3)), written(score("pending"))])).toBe(true);
    expect(itemsPending([written(score("failed")), written(null)])).toBe(false);
    expect(assessmentPending({ attempt: null })).toBe(false);
    const state = { id: "write", done: true, doneAt: null, locked: false, entry: null, modelAnswer: null };
    expect(dayPending({ progress: [{ ...state, aiScore: score("pending") }] })).toBe(true);
    expect(dayPending({ progress: [{ ...state, aiScore: score("not_scored") }] })).toBe(false);
    expect(homePending({ feedback: [feedback("write", null)] })).toBe(true);
    expect(homePending({ feedback: [feedback("mock", null), feedback("quiz", "3/4")] })).toBe(false);
  });
});

describe("AI score display", () => {
  it("labels the score once it's in", () => {
    expect(scoreLabel(score("scored", 4))).toBe("4/5");
    expect(scoreLabel(score("pending"))).toBeNull();
  });

  it("keeps a write lesson open after a save that has a score", () => {
    expect(stayAfterSave({ aiScore: score("pending") })).toBe(true);
    expect(stayAfterSave({ aiScore: null })).toBe(false);
  });
});
