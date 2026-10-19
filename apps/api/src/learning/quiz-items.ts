import { type Question, question, type QuizItem, type QuizItemResult } from "@portal/contracts";
import { AI_SCORE_SELECT, type AiScoreRow, legacyScoreStatus, toAiScore } from "../scoring/scoring.js";

/** How a stored quiz item becomes what the engineer sees. Correct answers only after answering. */

/** The quiz_items columns `quizItemView` needs. */
export const ITEM_SELECT = {
  position: true,
  questionData: true,
  choice: true,
  correct: true,
  textAnswer: true,
  scoreStatus: true,
  answeredAt: true,
  aiScore: { select: AI_SCORE_SELECT },
} as const;

export interface StoredItem {
  position: number;
  questionData: unknown;
  choice: number | null;
  correct: boolean | null;
  textAnswer: string | null;
  scoreStatus: string;
  answeredAt: Date | null;
  /** Written answers: the AI score row (null for choice items and answers saved before AI scoring). */
  aiScore: AiScoreRow | null;
}

export function storedQuestion(item: Pick<StoredItem, "questionData">): Question {
  return question.parse(item.questionData);
}

export function correctIndex(q: Question): number | null {
  const index = q.options?.findIndex((option) => option.correct) ?? -1;
  return index >= 0 ? index : null;
}

const SCORE_STATUSES = ["not_applicable", "pending", "scored", "failed"] as const;

function scoreStatus(value: string): QuizItemResult["scoreStatus"] {
  return SCORE_STATUSES.find((status) => status === value) ?? "pending";
}

export function itemResult(q: Question, item: StoredItem): QuizItemResult {
  if (q.type === "written") {
    const aiScore = item.aiScore ? toAiScore(item.aiScore) : null;
    return {
      choice: null,
      correct: null,
      correctIndex: null,
      explanations: [],
      text: item.textAnswer,
      modelAnswer: q.modelAnswer ?? null,
      scoreStatus: aiScore ? legacyScoreStatus(aiScore) : scoreStatus(item.scoreStatus),
      aiScore,
    };
  }
  return {
    choice: item.choice,
    correct: item.correct,
    correctIndex: correctIndex(q),
    explanations: (q.options ?? []).map((option) => option.explanation),
    text: null,
    modelAnswer: null,
    scoreStatus: "not_applicable",
    aiScore: null,
  };
}

export function quizItemView(item: StoredItem): QuizItem {
  const q = storedQuestion(item);
  return {
    position: item.position,
    type: q.type,
    stem: q.stem,
    clientLine: q.clientLine ?? null,
    options: q.type === "written" ? null : (q.options ?? []).map((option) => option.text),
    result: item.answeredAt ? itemResult(q, item) : null,
  };
}
