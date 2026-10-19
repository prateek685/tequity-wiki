import { Injectable } from "@nestjs/common";
import {
  type FeedbackItem,
  type HomeResponse,
  homeResponse,
  type JournalEntry,
  type JournalResponse,
  journalResponse,
  type Lesson,
  type ProgressResponse,
  type ReadinessModel,
  SCORECARD_FIELDS,
} from "@portal/contracts";
import { parseEntry } from "./entries.js";
import { type Learner, loadLearner } from "./learner.js";
import { buildProgress } from "./progress.js";
import { storedQuestion } from "./quiz-items.js";
import { baselinePillars, loadBaselineRatings } from "./scorecards.js";
import { asContract } from "../common/contract.js";
import { loadReadinessModel, storedDay } from "../content/lesson.js";
import { PrismaService, type Tx } from "../prisma/prisma.service.js";
import {
  assessmentFeedback,
  FEEDBACK_LIMIT,
  latestFeedback,
  mockFeedback,
  quizFeedback,
  writeFeedback,
} from "../rules/feedback.js";
import { pillarsOf } from "../rules/scorecard.js";

/**
 * The engineer's Home cards, Progress and Journal pages (packages/contracts/src/progress.ts). Every
 * query runs as the engineer through `withUser`; the journal and feedback read step_entries and
 * ai_scores, which only the engineer can see.
 */
@Injectable()
export class ProgressService {
  constructor(private readonly prisma: PrismaService) {}

  progress(userId: string): Promise<ProgressResponse> {
    return this.prisma.withUser(userId, async (tx) => buildProgress(tx, await loadLearner(tx, userId)));
  }

  /** Home: the Day-1 baseline per pillar and the latest feedback (mock calls, quizzes, assessments, writing). */
  home(userId: string): Promise<HomeResponse> {
    return this.prisma.withUser(userId, async (tx) => {
      const learner = await loadLearner(tx, userId);
      if (!learner) return asContract(homeResponse, { baseline: null, feedback: [] });
      const enrollmentId = learner.enrollment.id;
      const model = await loadReadinessModel(tx);
      return asContract(homeResponse, {
        baseline: baselinePillars(await loadBaselineRatings(tx, enrollmentId), model),
        feedback: await this.feedback(tx, learner),
      });
    });
  }

  journal(userId: string): Promise<JournalResponse> {
    return this.prisma.withUser(userId, async (tx) => {
      const learner = await loadLearner(tx, userId);
      if (!learner) return { entries: [] };
      const rows = await tx.stepEntry.findMany({
        where: { enrollmentId: learner.enrollment.id },
        select: { day: true, lessonId: true, round: true, entry: true, updatedAt: true },
      });
      const days = [...new Set(rows.map((row) => row.day))];
      const content = days.length
        ? await tx.contentDay.findMany({ where: { day: { in: days } }, select: { day: true, data: true } })
        : [];
      const model = await loadReadinessModel(tx);
      const byDay = new Map(content.map((row) => [row.day, storedDay.parse(row.data)]));

      const entries: (JournalEntry & { order: number; round: number })[] = [];
      for (const row of rows) {
        const data = byDay.get(row.day);
        const order = data?.lessons.findIndex((item) => item.id === row.lessonId) ?? -1;
        const target = data?.lessons[order];
        if (!data || !target) continue;
        for (const { label, text } of journalTexts(target, parseEntry(row.entry), model)) {
          entries.push({
            day: row.day,
            storyDate: data.storyDate,
            lessonId: target.id,
            // A day repeated after a gate: its later round's texts say so.
            lessonTitle: row.round > 1 ? `${target.title} (Round ${row.round})` : target.title,
            label,
            text,
            savedAt: row.updatedAt.toISOString(),
            order,
            round: row.round,
          });
        }
      }
      // Newest day first; within a day, lessons in lesson order (the sort is stable for a lesson's texts).
      entries.sort((a, b) => b.day - a.day || b.round - a.round || a.order - b.order);
      return asContract(journalResponse, {
        entries: entries.map(({ order: _order, round: _round, ...entry }) => entry),
      });
    });
  }

  /** Up to 4 of each kind, newest first, merged; titles come from the days' lessons. */
  private async feedback(tx: Tx, learner: Learner): Promise<FeedbackItem[]> {
    const enrollmentId = learner.enrollment.id;
    const take = FEEDBACK_LIMIT;
    const mockDays = await tx.rubricScore.findMany({
      where: { enrollmentId, source: "mock_self" },
      distinct: ["day"],
      select: { day: true },
    });
    const entries = mockDays.length
      ? await tx.stepEntry.findMany({
          where: { enrollmentId, day: { in: mockDays.map((row) => row.day) } },
          select: { day: true, lessonId: true, entry: true, updatedAt: true },
        })
      : [];
    const quizzes = await tx.quizAttempt.findMany({
      where: { enrollmentId, kind: "daily", completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
      take,
      select: { day: true, completedAt: true, items: { select: { questionData: true, correct: true } } },
    });
    const assessments = await tx.quizAttempt.findMany({
      where: { enrollmentId, kind: "assessment", completedAt: { not: null } },
      orderBy: { completedAt: "desc" },
      take,
      select: { day: true, completedAt: true, choiceCorrect: true, choiceTotal: true },
    });
    const writes = await tx.aiScore.findMany({
      where: { enrollmentId, target: "lesson", status: { in: ["scored", "pending"] } },
      orderBy: { updatedAt: "desc" },
      take,
      select: {
        day: true,
        lessonId: true,
        score: true,
        betterSentence: true,
        updatedAt: true,
        scoredAt: true,
      },
    });

    const days = [...new Set([...entries.map((row) => row.day), ...writes.map((row) => row.day)])];
    const content = days.length
      ? await tx.contentDay.findMany({ where: { day: { in: days } }, select: { day: true, data: true } })
      : [];
    const lessonsOf = new Map(content.map((row) => [row.day, storedDay.parse(row.data).lessons]));

    const items: FeedbackItem[] = [];
    for (const row of entries) {
      const lessons = lessonsOf.get(row.day) ?? [];
      const reflect = lessons.find((item) => item.id === row.lessonId);
      if (!reflect || reflect.kind !== "reflect" || !reflect.rubric) continue;
      const mock = lessons.find((item) => item.kind === "mock");
      items.push(
        mockFeedback({
          day: row.day,
          lessonId: reflect.id,
          title: mock?.title ?? reflect.title,
          entry: parseEntry(row.entry),
          at: row.updatedAt,
        }),
      );
    }
    for (const quiz of quizzes) {
      const choice = quiz.items.filter((item) => storedQuestion(item).type !== "written");
      if (!quiz.completedAt || choice.length === 0) continue;
      items.push(
        quizFeedback({
          day: quiz.day,
          correct: choice.filter((item) => item.correct === true).length,
          total: choice.length,
          at: quiz.completedAt,
        }),
      );
    }
    for (const attempt of assessments) {
      if (!attempt.completedAt) continue;
      items.push(
        assessmentFeedback({
          day: attempt.day,
          correct: attempt.choiceCorrect ?? 0,
          total: attempt.choiceTotal ?? 0,
          at: attempt.completedAt,
        }),
      );
    }
    for (const write of writes) {
      const lesson = lessonsOf.get(write.day)?.find((item) => item.id === write.lessonId);
      if (!lesson || !write.lessonId) continue;
      items.push(
        writeFeedback({
          day: write.day,
          lessonId: write.lessonId,
          title: lesson.title,
          score: write.score,
          betterSentence: write.betterSentence,
          at: write.scoredAt ?? write.updatedAt,
        }),
      );
    }
    return latestFeedback(items);
  }
}

/** The non-empty texts of a saved lesson, with their labels, in the order the lesson shows them. */
export function journalTexts(
  target: Lesson,
  entry: ReturnType<typeof parseEntry>,
  model: ReadinessModel | null,
): { label: string; text: string }[] {
  const out: { label: string; text: string }[] = [];
  const add = (label: string, text: string | undefined) => {
    const trimmed = text?.trim() ?? "";
    if (trimmed) out.push({ label, text: trimmed });
  };
  for (const field of target.fields) add(field.label, entry.values[field.id]);
  if (target.scorecard.length > 0) {
    for (const pillar of pillarsOf(target.scorecard, model?.behaviours ?? [])) {
      const name = model?.pillars.find((p) => p.id === pillar)?.name ?? pillar;
      add(`Proof: ${name}`, entry.values[SCORECARD_FIELDS.proof(pillar)]);
    }
    add("Biggest win", entry.values[SCORECARD_FIELDS.win]);
    add("Where I'm stuck", entry.values[SCORECARD_FIELDS.stuck]);
  }
  entry.rounds.forEach((round, index) => add(`Round ${index + 1} fix`, round.fix));
  return out;
}
