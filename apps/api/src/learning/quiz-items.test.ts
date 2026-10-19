import { describe, expect, it } from "vitest";
import { quizItemView, type StoredItem } from "./quiz-items.js";

const mcq = {
  id: "D01-01",
  type: "mcq",
  stem: "Which comes first?",
  options: [
    { text: "A", correct: false, explanation: "Not A." },
    { text: "B", correct: true, explanation: "B is right." },
    { text: "C", correct: false, explanation: "Not C." },
    { text: "D", correct: false, explanation: "Not D." },
  ],
  source: { quote: "a quoted passage", page: 10 },
};
const written = {
  id: "D01-05",
  type: "written",
  stem: "Explain.",
  modelAnswer: "The model answer.",
  scoringPoints: ["one", "two"],
  source: { quote: "a quoted passage", page: 10 },
};

const item = (questionData: unknown, answered: Partial<StoredItem> = {}): StoredItem => ({
  position: 0,
  questionData,
  choice: null,
  correct: null,
  textAnswer: null,
  scoreStatus: "not_applicable",
  answeredAt: null,
  aiScore: null,
  ...answered,
});

describe("quiz item view", () => {
  it("never includes correct answers, explanations or the model answer before answering", () => {
    const view = quizItemView(item(mcq));
    expect(view).toEqual({
      position: 0,
      type: "mcq",
      stem: "Which comes first?",
      clientLine: null,
      options: ["A", "B", "C", "D"],
      result: null,
    });
    expect(JSON.stringify(quizItemView(item(written, { scoreStatus: "pending" })))).not.toContain(
      "model answer",
    );
  });

  it("shows the result with every explanation once answered", () => {
    const view = quizItemView(item(mcq, { choice: 0, correct: false, answeredAt: new Date() }));
    expect(view.result).toMatchObject({ choice: 0, correct: false, correctIndex: 1 });
    expect(view.result?.explanations).toHaveLength(4);
  });

  it("returns the model answer and pending score for a written answer", () => {
    const view = quizItemView(
      item(written, { textAnswer: "Mine", scoreStatus: "pending", answeredAt: new Date() }),
    );
    expect(view.options).toBeNull();
    expect(view.result).toMatchObject({
      text: "Mine",
      modelAnswer: "The model answer.",
      scoreStatus: "pending",
      aiScore: null,
    });
  });

  it("returns the AI score of a written answer, with scoreStatus mirroring it", () => {
    const scoredAt = new Date("2026-10-09T10:00:00Z");
    const aiScore = {
      status: "scored",
      score: 4,
      points: [
        { point: "one", verdict: "met" },
        { point: "two", verdict: "partly" },
      ],
      reason: "Good.",
      betterSentence: "Better.",
      possiblePhi: false,
      scoredAt,
    };
    const view = quizItemView(item(written, { textAnswer: "Mine", answeredAt: new Date(), aiScore }));
    expect(view.result).toMatchObject({
      scoreStatus: "scored",
      aiScore: { status: "scored", score: 4, betterSentence: "Better.", scoredAt: scoredAt.toISOString() },
    });
    const notScored = quizItemView(
      item(written, {
        textAnswer: "Mine",
        answeredAt: new Date(),
        aiScore: { ...aiScore, status: "not_scored" },
      }),
    );
    expect(notScored.result?.scoreStatus).toBe("failed");
    expect(quizItemView(item(mcq, { choice: 1, answeredAt: new Date() })).result?.aiScore).toBeNull();
  });
});
