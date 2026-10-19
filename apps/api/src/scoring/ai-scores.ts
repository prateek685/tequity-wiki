import { type ScoreRef } from "./scoring.js";
import { Prisma } from "../generated/prisma/client.js";
import { type Tx } from "../prisma/prisma.service.js";

/**
 * The API's side of AI scoring, inside the engineer's transaction (`withUser`): rows are only ever
 * created or reset as `pending` / `not_scored` (row-level security allows nothing else). The caller
 * queues the returned refs after the transaction commits.
 */

/** Setting `ai.scoreRealProjectAnswers`; off when missing. */
export async function loadScoreRealProjectAnswers(tx: Tx): Promise<boolean> {
  const row = await tx.setting.findUnique({
    where: { key: "ai.scoreRealProjectAnswers" },
    select: { value: true },
  });
  return row?.value === true;
}

/** A written quiz or assessment answer was saved: its score starts `pending`. */
export async function createQuizItemScore(
  tx: Tx,
  item: { enrollmentId: string; userId: string; day: number; round: number; quizItemId: string },
): Promise<ScoreRef> {
  const row = await tx.aiScore.create({
    data: { ...item, target: "quiz_item", status: "pending" },
    select: { id: true, revision: true },
  });
  return { aiScoreId: row.id, userId: item.userId, revision: row.revision };
}

/** Clears the result and asks again (a new revision, so an older job for this row does nothing). */
const reset = (status: "pending" | "not_scored") => ({
  status,
  revision: { increment: 1 },
  score: null,
  points: Prisma.DbNull,
  reason: null,
  betterSentence: null,
  possiblePhi: false,
  model: null,
  promptVersion: null,
  attempts: 0,
  scoredAt: null,
  updatedAt: new Date(),
});

/**
 * A write lesson with a scoring guide was saved. No row yet, or the answer text changed (or it was
 * `not_scored` and now may be scored) → `pending` with a new revision, returned for queueing. The same
 * text again → left as it is. A real-project answer while the setting is off → `not_scored`, no job.
 * Nothing written → nothing to score.
 */
export async function saveWriteScore(
  tx: Tx,
  save: {
    enrollmentId: string;
    userId: string;
    day: number;
    /** The day's round: a repeated write lesson is scored again in its own row. */
    round: number;
    lessonId: string;
    answer: string;
    previousAnswer: string | null;
    notScored: boolean;
  },
): Promise<ScoreRef | null> {
  const { enrollmentId, userId, day, round, lessonId } = save;
  if (!save.answer) return null;
  const existing = await tx.aiScore.findFirst({
    where: { enrollmentId, day, round, lessonId, target: "lesson" },
    select: { id: true, status: true },
  });
  const status = save.notScored ? "not_scored" : "pending";
  if (!existing) {
    const row = await tx.aiScore.create({
      data: { enrollmentId, userId, day, round, lessonId, target: "lesson", status },
      select: { id: true, revision: true },
    });
    return status === "pending" ? { aiScoreId: row.id, userId, revision: row.revision } : null;
  }
  const changed = save.answer !== save.previousAnswer;
  if (status === "not_scored") {
    if (existing.status !== "not_scored")
      await tx.aiScore.update({ where: { id: existing.id }, data: reset("not_scored") });
    return null;
  }
  if (!changed && existing.status !== "not_scored") return null;
  const row = await tx.aiScore.update({
    where: { id: existing.id },
    data: reset("pending"),
    select: { revision: true },
  });
  return { aiScoreId: existing.id, userId, revision: row.revision };
}
