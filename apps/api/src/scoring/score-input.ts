import { question } from "@portal/contracts";
import { parseGuides, quizTask, type ScoreRef, writeAnswerText, writeTask } from "./scoring.js";
import { storedDay } from "../content/lesson.js";
import { parseEntry } from "../learning/entries.js";
import { type ScoreInput } from "../llm/llm-client.js";
import { type Tx } from "../prisma/prisma.service.js";

/**
 * What the worker sends to the scorer for one ai_scores row. Read as the engineer (`withUser` with the
 * row's owner), so row-level security still applies: the worker sees only that engineer's answer.
 *
 * "stale": the row is gone, already handled, or has a newer revision (its own job will score it).
 * "unscorable": the answer or its guide is missing; retrying won't help.
 */
export async function loadScoreInput(tx: Tx, ref: ScoreRef): Promise<ScoreInput | "stale" | "unscorable"> {
  const row = await tx.aiScore.findUnique({
    where: { id: ref.aiScoreId },
    select: {
      userId: true,
      enrollmentId: true,
      day: true,
      target: true,
      quizItemId: true,
      lessonId: true,
      round: true,
      status: true,
      revision: true,
    },
  });
  if (!row || row.userId !== ref.userId || row.revision !== ref.revision || row.status !== "pending")
    return "stale";

  if (row.target === "quiz_item" && row.quizItemId) {
    const item = await tx.quizItem.findUnique({
      where: { id: row.quizItemId },
      select: { kind: true, questionData: true, textAnswer: true },
    });
    const q = question.safeParse(item?.questionData);
    if (!item?.textAnswer || !q.success || !q.data.modelAnswer || !q.data.scoringPoints?.length)
      return "unscorable";
    return {
      kind: item.kind === "assessment" ? "assessment" : "quiz",
      task: quizTask(q.data),
      answer: item.textAnswer,
      modelAnswer: q.data.modelAnswer,
      scoringPoints: q.data.scoringPoints,
    };
  }

  if (row.target === "lesson" && row.lessonId) {
    const content = await tx.contentDay.findUnique({
      where: { day: row.day },
      select: { data: true, writeScoring: true },
    });
    const day = storedDay.safeParse(content?.data);
    const lesson = day.success ? day.data.lessons.find((item) => item.id === row.lessonId) : undefined;
    const guide = parseGuides(content?.writeScoring).get(row.lessonId);
    const saved = await tx.stepEntry.findUnique({
      where: {
        enrollmentId_day_lessonId_round: {
          enrollmentId: row.enrollmentId,
          day: row.day,
          lessonId: row.lessonId,
          round: row.round,
        },
      },
      select: { entry: true },
    });
    if (!lesson || !guide || !saved) return "unscorable";
    const answer = writeAnswerText(lesson, parseEntry(saved.entry).values);
    if (!answer) return "unscorable";
    return {
      kind: "write",
      task: writeTask(lesson),
      answer,
      modelAnswer: guide.modelAnswer,
      scoringPoints: guide.scoringPoints,
    };
  }
  return "unscorable";
}
