import { describe, expect, it } from "vitest";
import {
  isRealProjectAnswer,
  legacyScoreStatus,
  parseGuides,
  quizTask,
  scoreJobId,
  toAiScore,
  writeAnswerText,
  writeTask,
} from "./scoring.js";

const field = (id: string, label: string) => ({
  id,
  label,
  kind: "area" as const,
  placeholder: "",
  required: false,
});
const lesson = {
  title: "Rewrite",
  heading: "Rewrite the status update",
  lead: "Make it answer-first.",
  fields: [field("first", "Message 1"), field("second", "Message 2"), field("third", "Message 3")],
};

describe("scoreJobId", () => {
  it("is one id per row and revision, without ':' (BullMQ forbids it in custom ids)", () => {
    const id = scoreJobId({ aiScoreId: "8e0b6b6e-1c4f-4c2b-9a51-3a3c2f1e9d10", revision: 2 });
    expect(id).toBe("score-8e0b6b6e-1c4f-4c2b-9a51-3a3c2f1e9d10-2");
    expect(id).not.toContain(":");
  });
});

describe("writeAnswerText", () => {
  it("joins the non-empty fields as '<label>:\\n<value>' in field order", () => {
    expect(writeAnswerText(lesson, { third: " Third. ", first: "First.", second: "  " })).toBe(
      "Message 1:\nFirst.\n\nMessage 3:\nThird.",
    );
    expect(writeAnswerText(lesson, { unknown: "x" })).toBe("");
  });
});

describe("tasks", () => {
  it("describe the write lesson and the question", () => {
    expect(writeTask(lesson)).toBe(
      "Rewrite the status update\n\nMake it answer-first.\n\nFields:\n- Message 1\n- Message 2\n- Message 3",
    );
    expect(quizTask({ stem: "What do you say?", clientLine: "Is it late?" })).toBe(
      'What do you say?\n\nThe client says: "Is it late?"',
    );
    expect(quizTask({ stem: "Explain." })).toBe("Explain.");
  });
});

describe("guides and real-project answers", () => {
  it("reads write_scoring by lesson id, ignoring a malformed column", () => {
    const guides = parseGuides({ rewrite: { modelAnswer: "M", scoringPoints: ["A", "B"] } });
    expect(guides.get("rewrite")?.scoringPoints).toEqual(["A", "B"]);
    expect(parseGuides(null).size).toBe(0);
    expect(parseGuides({ rewrite: { modelAnswer: 1 } }).size).toBe(0);
  });

  it("counts a real-project answer only where the lesson allows real work", () => {
    expect(isRealProjectAnswer({ source: "carebook" }, true)).toBe(false);
    expect(isRealProjectAnswer({ source: "both" }, true)).toBe(true);
    expect(isRealProjectAnswer({ source: "real_project" }, true)).toBe(true);
    expect(isRealProjectAnswer({ source: "both" }, false)).toBe(false);
  });
});

describe("toAiScore", () => {
  it("maps a row to the contract; not_scored shows as failed for older clients", () => {
    const row = {
      status: "scored",
      score: 4,
      points: [{ point: "A", verdict: "met" }],
      reason: "Good.",
      betterSentence: "Better.",
      possiblePhi: false,
      scoredAt: new Date("2026-10-09T10:00:00Z"),
    };
    expect(toAiScore(row)).toEqual({ ...row, scoredAt: "2026-10-09T10:00:00.000Z" });
    const pending = toAiScore({ ...row, status: "pending", score: null, points: null, scoredAt: null });
    expect(pending).toMatchObject({ status: "pending", points: [], scoredAt: null });
    expect(legacyScoreStatus({ ...pending, status: "not_scored" })).toBe("failed");
    expect(legacyScoreStatus(pending)).toBe("pending");
  });
});
