import { Injectable } from "@nestjs/common";
import {
  type AnswerQuizItemRequest,
  type AnswerQuizItemResponse,
  answerQuizItemResponse,
  type CourseOutlineResponse,
  courseOutlineResponse,
  dayViewResponse,
  type DayViewResponse,
  type Lesson,
  type LessonEntry,
  type LessonState,
  lessonState,
  type MyPlanResponse,
  myPlanResponse,
  type OutlineDay,
  PILLARS,
  type PromptCopyResponse,
  type QuestionType,
  type QuizViewResponse,
  type ReadinessModel,
  quizViewResponse,
  RAG,
  type SaveLessonRequest,
} from "@portal/contracts";
import { z } from "zod";
import { finishAssessment, outlineAssessments } from "./assessments.js";
import { parseEntry } from "./entries.js";
import { gateSummaries } from "./gates.js";
import {
  dayRound,
  type Learner,
  loadLearner,
  loadPace,
  lockAssessment,
  lockDay,
  requireLearner,
  requireWorkableDay,
} from "./learner.js";
import { finalSummary, loadLivePlan, saveLiveCall, shareReadinessCase } from "./phase3.js";
import { ITEM_SELECT, itemResult, quizItemView, storedQuestion } from "./quiz-items.js";
import {
  baselinePillars,
  loadBaselineRatings,
  loadScorecards,
  loadWeekStats,
  saveScorecard,
} from "./scorecards.js";
import { audit } from "../common/audit.js";
import { asContract } from "../common/contract.js";
import { isoFromDate } from "../common/dates.js";
import { DomainError } from "../common/domain-error.js";
import { RequestValidationError } from "../common/zod-validation.pipe.js";
import {
  dayPool,
  dayType,
  loadDayContent,
  loadDayLessons,
  loadPhases,
  loadReadinessModel,
  storedDay,
} from "../content/lesson.js";
import { type Prisma } from "../generated/prisma/client.js";
import { PrismaService, type Tx } from "../prisma/prisma.service.js";
import { canStartQuiz, hasDailyQuiz, isDayComplete, quizStatus } from "../rules/day-completion.js";
import { currentDay, type DayState, hasAssessmentAfter, TOTAL_DAYS } from "../rules/day-status.js";
import { allLessonsDone, lessonEntryProblems } from "../rules/lesson.js";
import { canSupplyDailyQuiz, pickDailyQuiz } from "../rules/quiz-pick.js";
import { isScorecardLesson, scorecardSeries, weekOf } from "../rules/scorecard.js";
import { createQuizItemScore, loadScoreRealProjectAnswers, saveWriteScore } from "../scoring/ai-scores.js";
import { ScoringQueue } from "../scoring/scoring-queue.js";
import {
  AI_SCORE_SELECT,
  type AiScoreRow,
  isRealProjectAnswer,
  parseGuides,
  type ScoreRef,
  toAiScore,
  writeAnswerText,
  type WriteScoringGuide,
} from "../scoring/scoring.js";

/** One daily quiz per day and round. */
const DAILY_ATTEMPT = 1;
const DAYS_PER_WEEK = 5;
const LAST_WEEK = TOTAL_DAYS / DAYS_PER_WEEK;

/** One day of one enrollment in one round (repeat blocks): the key of every per-day row. */
interface DayRound {
  enrollmentId: string;
  day: number;
  round: number;
}

interface SavedEntry {
  entry: unknown;
  doneAt: Date;
}

/** A day's write-lesson scoring guides and the engineer's AI scores for them, by lesson id. */
interface DayScoring {
  guides: Map<string, WriteScoringGuide>;
  scores: Map<string, AiScoreRow>;
}

/** A just-saved written answer's score, before the worker picks it up. */
const PENDING_SCORE: AiScoreRow = {
  status: "pending",
  score: null,
  points: null,
  reason: null,
  betterSentence: null,
  possiblePhi: false,
  scoredAt: null,
};

/**
 * Engineer learning API (docs/LESSON_FORMAT.md, docs/M1_SPEC.md "Rules"). Every query runs as the
 * engineer through `withUser`, so row-level security limits it to their own rows. Written answers are
 * saved with a `pending` AI score in the same transaction and queued for scoring after it commits
 * (docs/M2_SPEC.md "AI scoring"); nothing here waits for the score.
 */
@Injectable()
export class LearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: ScoringQueue,
  ) {}

  plan(userId: string): Promise<MyPlanResponse> {
    return this.prisma.withUser(userId, async (tx) => {
      const learner = await loadLearner(tx, userId);
      const content = await tx.contentDay.findMany({
        select: { day: true, title: true, blockNumber: true, type: true },
      });
      const byDay = new Map(content.map((row) => [row.day, row]));
      const days = dayStatesOf(learner).map((state) => {
        const row = byDay.get(state.day);
        return {
          ...state,
          round: dayRound(learner, state.day),
          title: row?.title ?? "",
          blockNumber: row?.blockNumber ?? Math.ceil(state.day / DAYS_PER_WEEK),
          type: row ? dayType(row.type) : defaultDayType(state.day),
        };
      });
      return asContract(myPlanResponse, {
        enrollment: learner
          ? { startDate: learner.enrollment.startDate, targetDate: learner.enrollment.targetDate }
          : null,
        pace: learner ? await loadPace(tx, learner) : null,
        currentDay: learner ? currentDay(learner.states) : null,
        days,
        checkins: learner ? await this.checkins(tx, learner.enrollment.id) : [],
        gates: await gateSummaries(tx, learner),
        finalReview: await finalSummary(tx, learner),
      });
    });
  }

  /** The course outline: phases → weeks → days → lessons, with status and what's done. */
  course(userId: string): Promise<CourseOutlineResponse> {
    return this.prisma.withUser(userId, async (tx) => {
      const learner = await loadLearner(tx, userId);
      const unlockAll = learner?.unlockAll ?? false;
      const phases = await loadPhases(tx);
      const blocks = await tx.contentBlock.findMany({ select: { number: true, data: true } });
      const contentRows = await tx.contentDay.findMany({
        select: { day: true, title: true, type: true, data: true },
      });
      const content = new Map(
        contentRows.map((row) => [row.day, { ...row, data: storedDay.parse(row.data) }]),
      );
      const enrollmentId = learner?.enrollment.id;
      const entries = enrollmentId
        ? await tx.stepEntry.findMany({
            where: { enrollmentId },
            select: { day: true, lessonId: true, round: true },
          })
        : [];
      const attempts = enrollmentId
        ? await tx.quizAttempt.findMany({
            where: { enrollmentId, kind: "daily", attempt: DAILY_ATTEMPT },
            select: { day: true, round: true, completedAt: true },
          })
        : [];
      const pools = await tx.question.findMany({
        where: { retired: false, pool: { startsWith: "day-" } },
        select: { id: true, pool: true, type: true },
      });

      const assessments = await outlineAssessments(tx, learner);

      const states = dayStatesOf(learner);
      const outlineDay = (day: number): OutlineDay => {
        const state = states[day - 1] ?? { status: "not_ready" as const, lockReason: null };
        const row = content.get(day);
        const round = dayRound(learner, day);
        const done = new Set(
          entries.filter((e) => e.day === day && e.round === round).map((e) => e.lessonId),
        );
        const lessons = row?.data.lessons ?? [];
        const lessonsDone = lessons.length > 0 && allLessonsDone(lessonIds(lessons), done);
        const attempt = attempts.find((a) => a.day === day && a.round === round);
        const pool = pools
          .filter((q) => q.pool === dayPool(day))
          .map((q) => ({ id: q.id, type: questionType(q.type) }));
        return {
          day,
          title: row?.title ?? "",
          storyDate: row?.data.storyDate ?? "",
          type: row ? dayType(row.type) : defaultDayType(day),
          status: state.status,
          lockReason: state.lockReason,
          lessons: lessons.map((item) => ({
            id: item.id,
            title: item.title,
            kind: item.kind,
            minutes: item.minutes,
            done: done.has(item.id),
          })),
          quiz: {
            status: row
              ? quizStatus({
                  day,
                  lessonsDone,
                  unlockAll,
                  attempt: attempt ? { completed: attempt.completedAt !== null } : null,
                  poolReady: canSupplyDailyQuiz(pool),
                })
              : hasDailyQuiz(day)
                ? "not_ready"
                : "none",
          },
          round,
        };
      };

      const blockOf = new Map(
        blocks.map((row) => {
          const data = row.data as { title?: unknown; phase?: unknown };
          return [
            row.number,
            {
              title: typeof data.title === "string" ? data.title : "",
              phase: typeof data.phase === "number" ? data.phase : null,
            },
          ];
        }),
      );
      const gates = await gateSummaries(tx, learner);
      const final = await finalSummary(tx, learner);
      const weekNumbers = new Set([
        ...blocks.map((row) => row.number),
        ...contentRows.map((row) => Math.ceil(row.day / DAYS_PER_WEEK)),
      ]);
      const weeks = [...weekNumbers]
        .sort((a, b) => a - b)
        .map((number) => {
          const first = (number - 1) * DAYS_PER_WEEK + 1;
          const days = Array.from({ length: DAYS_PER_WEEK }, (_, i) => first + i).filter(
            (d) => d <= TOTAL_DAYS,
          );
          const info = blockOf.get(number);
          const phase =
            info?.phase ?? phases.find((p) => first >= p.fromDay && first <= p.toDay)?.number ?? 1;
          const assessmentDay = number * DAYS_PER_WEEK;
          const assessment = hasAssessmentAfter(assessmentDay)
            ? { day: assessmentDay, status: assessments.get(assessmentDay) ?? ("locked" as const) }
            : null;
          const gate = gates.find((g) => g.afterDay === number * DAYS_PER_WEEK) ?? null;
          const finalReview = number === LAST_WEEK ? final : null;
          return {
            number,
            title: info?.title ?? "",
            phase,
            days: days.map(outlineDay),
            assessment,
            gate,
            finalReview,
          };
        });

      return asContract(courseOutlineResponse, {
        currentDay: learner ? currentDay(learner.states) : null,
        unlockAll,
        phases: phases.map((p) => ({ number: p.number, name: p.name })),
        weeks,
      });
    });
  }

  day(userId: string, day: number): Promise<DayViewResponse> {
    return this.prisma.withUser(userId, async (tx) => {
      const learner = await requireLearner(tx, userId);
      const status = requireWorkableDay(learner, day);
      const content = await loadDayContent(tx, day);
      if (!content) throw new DomainError("DAY_NOT_READY");
      const enrollmentId = learner.enrollment.id;
      const round = dayRound(learner, day);
      const at = { enrollmentId, day, round };
      // Opening a day for the first time (in this round) records it.
      await tx.dayProgress.createMany({ data: [{ ...at, userId }], skipDuplicates: true });
      const entries = await this.lessonEntries(tx, at);
      const done = new Set(entries.keys());
      const ids = lessonIds(content.lessons);
      const lessonsDone = allLessonsDone(ids, done);
      const scoring = await this.dayScoring(tx, at);
      const attempt = await this.dailyAttempt(tx, at);
      const poolReady =
        canStartQuiz(lessonsDone, learner.unlockAll) && !attempt && hasDailyQuiz(day)
          ? canSupplyDailyQuiz(await this.questionPool(tx, day))
          : false;
      return asContract(dayViewResponse, {
        day: content.day,
        title: content.title,
        type: content.type,
        storyDate: content.storyDate,
        minutes: content.minutes,
        intro: content.intro,
        status,
        lockReason: null,
        round,
        block: content.block,
        lessons: content.lessons,
        progress: content.lessons.map((item) => toLessonState(item, entries.get(item.id), scoring)),
        cards: content.cards,
        model: content.model,
        baseline: await this.baseline(
          tx,
          enrollmentId,
          day === 1 && round === 1 ? { lessons: content.lessons, entries } : null,
        ),
        recalls: await this.recalls(tx, enrollmentId, content.lessons),
        weekStats: content.lessons.some(isScorecardLesson)
          ? await loadWeekStats(tx, enrollmentId, weekOf(day), round)
          : null,
        quiz: {
          status: quizStatus({
            day,
            lessonsDone,
            unlockAll: learner.unlockAll,
            attempt: attempt ? { completed: attempt.completedAt !== null } : null,
            poolReady,
          }),
          attemptId: attempt?.id ?? null,
        },
        unlockAll: learner.unlockAll,
        livePlan: content.lessons.some((item) => item.kind === "live")
          ? await loadLivePlan(tx, enrollmentId)
          : null,
        pillarNow: content.lessons.some((item) => item.blocks.some((b) => b.type === "pillarCompare"))
          ? await this.pillarNow(tx, enrollmentId, content.model)
          : null,
      });
    });
  }

  /** Per pillar: the Day-1 baseline and the latest scorecard score (Day 1 → now). */
  private async pillarNow(tx: Tx, enrollmentId: string, model: ReadinessModel) {
    const dayOne = baselinePillars(await loadBaselineRatings(tx, enrollmentId), model);
    const { now } = scorecardSeries(await loadScorecards(tx, enrollmentId), dayOne);
    return PILLARS.map((pillar) => ({ pillar, dayOne: dayOne?.[pillar] ?? null, now: now[pillar] }));
  }

  async saveLesson(
    userId: string,
    day: number,
    lessonId: string,
    request: SaveLessonRequest,
  ): Promise<LessonState> {
    const { state, scores } = await this.prisma.withUser(userId, async (tx) => {
      const learner = await requireLearner(tx, userId);
      requireWorkableDay(learner, day);
      const lessons = await loadDayLessons(tx, day);
      if (!lessons) throw new DomainError("DAY_NOT_READY");
      const target = lessons.find((item) => item.id === lessonId);
      if (!target) throw new DomainError("LESSON_NOT_IN_DAY");
      // "I used my real project" only applies to lessons that allow real-project material.
      const body = target.source === "carebook" ? { ...request, realProject: false } : request;
      const model = await this.checkEntry(tx, target, body);
      // Saving the last lessons at once (or with the last quiz answer) must still complete the day.
      const enrollmentId = learner.enrollment.id;
      const round = dayRound(learner, day);
      const at = { enrollmentId, day, round };
      await lockDay(tx, enrollmentId, day);
      const key = { enrollmentId, day, lessonId, round };
      const previous = await tx.stepEntry.findUnique({
        where: { enrollmentId_day_lessonId_round: key },
        select: { entry: true },
      });
      const entry = body as Prisma.InputJsonObject;
      const saved = await tx.stepEntry.upsert({
        where: { enrollmentId_day_lessonId_round: key },
        create: { ...key, userId, entry },
        update: { entry, updatedAt: new Date() },
        select: { entry: true, doneAt: true },
      });
      if (target.rubric) await this.saveMockRubric(tx, learner, at, body.rubric);
      if (target.kind === "live" && target.liveRole && body.livePath)
        await saveLiveCall(tx, { ...at, userId }, target.liveRole, body.livePath);
      if (target.shareReadiness) await shareReadinessCase(tx, { enrollmentId, userId }, target, body.values);
      // Day 65 has no quiz: its lessons complete it.
      await this.completeDayIfDone(tx, at);
      if (model && isScorecardLesson(target)) await saveScorecard(tx, learner, day, round, body, model);

      const guide = target.kind === "write" ? (await this.guides(tx, day)).get(lessonId) : undefined;
      const scores: ScoreRef[] = [];
      if (guide) {
        const notScored =
          isRealProjectAnswer(target, body.realProject) && !(await loadScoreRealProjectAnswers(tx));
        const ref = await saveWriteScore(tx, {
          enrollmentId,
          userId,
          day,
          round,
          lessonId,
          answer: writeAnswerText(target, body.values),
          previousAnswer: previous ? writeAnswerText(target, parseEntry(previous.entry).values) : null,
          notScored,
        });
        if (ref) scores.push(ref);
      }
      const scoring = guide
        ? {
            guides: new Map([[lessonId, guide]]),
            scores: await this.lessonScores(tx, at, lessonId),
          }
        : null;
      return { state: asContract(lessonState, toLessonState(target, saved, scoring)), scores };
    });
    await this.scoring.enqueue(scores);
    return state;
  }

  promptCopy(userId: string, day: number, lessonId: string): Promise<PromptCopyResponse> {
    return this.prisma.withUser(userId, async (tx) => {
      const learner = await requireLearner(tx, userId);
      requireWorkableDay(learner, day);
      const lessons = await loadDayLessons(tx, day);
      if (!lessons) throw new DomainError("DAY_NOT_READY");
      const target = lessons.find((item) => item.id === lessonId);
      if (!target) throw new DomainError("LESSON_NOT_IN_DAY");
      const cardId =
        target.kind === "mock" ? target.cardId : target.kind === "live" ? target.substituteCardId : undefined;
      if (!cardId) throw new DomainError("NOT_FOUND");
      const rows = await tx.$queryRaw<
        { prompt: string | null }[]
      >`SELECT app.card_prompt(${cardId}) AS prompt`;
      const prompt = rows[0]?.prompt;
      if (!prompt) throw new DomainError("NOT_FOUND");
      await audit(tx, "prompt.copied", "card", cardId, null, { day, lesson: lessonId });
      return { prompt };
    });
  }

  startQuiz(userId: string, day: number): Promise<QuizViewResponse> {
    return this.prisma.withUser(userId, async (tx) => {
      const learner = await requireLearner(tx, userId);
      requireWorkableDay(learner, day);
      if (!hasDailyQuiz(day)) throw new DomainError("NOT_FOUND");
      // Two quick "start" calls (e.g. a double click) must resume one attempt, not race to create two.
      await lockDay(tx, learner.enrollment.id, day);
      const at = { enrollmentId: learner.enrollment.id, day, round: dayRound(learner, day) };
      const existing = await this.dailyAttempt(tx, at);
      if (existing) return this.quizView(tx, existing.id);

      const lessons = await loadDayLessons(tx, day);
      if (!lessons) throw new DomainError("DAY_NOT_READY");
      const done = new Set((await this.lessonEntries(tx, at)).keys());
      if (!canStartQuiz(allLessonsDone(lessonIds(lessons), done), learner.unlockAll))
        throw new DomainError("STEPS_NOT_DONE");
      const picked = pickDailyQuiz(await this.questionPool(tx, day));
      if (!picked) throw new DomainError("QUIZ_NOT_READY");

      const attempt = await tx.quizAttempt.create({
        data: { ...at, userId, kind: "daily", attempt: DAILY_ATTEMPT },
        select: { id: true },
      });
      await tx.quizItem.createMany({
        data: picked.map((q, position) => ({
          attemptId: attempt.id,
          userId,
          kind: "daily" as const,
          position,
          questionId: q.id,
          questionVersion: q.version,
          questionData: q.data as Prisma.InputJsonValue,
          scoreStatus: q.type === "written" ? "pending" : "not_applicable",
        })),
      });
      return this.quizView(tx, attempt.id);
    });
  }

  async answer(
    userId: string,
    attemptId: string,
    position: number,
    body: AnswerQuizItemRequest,
  ): Promise<AnswerQuizItemResponse> {
    const { response, scores } = await this.prisma.withUser(userId, async (tx) => {
      const attempt = await tx.quizAttempt.findFirst({
        where: { id: attemptId, userId },
        select: { id: true, day: true, round: true, enrollmentId: true, kind: true },
      });
      if (!attempt) throw new DomainError("NOT_FOUND");
      const isAssessment = attempt.kind === "assessment";
      // Answering the last two items at once must still complete the quiz (and the day) exactly once.
      if (isAssessment) await lockAssessment(tx, attempt.enrollmentId, attempt.day);
      else await lockDay(tx, attempt.enrollmentId, attempt.day);
      const item = await tx.quizItem.findUnique({
        where: { attemptId_position: { attemptId, position } },
        select: { id: true, ...ITEM_SELECT },
      });
      if (!item) throw new DomainError("NOT_FOUND");
      if (item.answeredAt) throw new DomainError("QUIZ_ALREADY_ANSWERED");

      const q = storedQuestion(item);
      const answer = answerFields(q, body);
      // Conditional update: a double submit can't answer the same item twice.
      const updated = await tx.quizItem.updateMany({
        where: { id: item.id, answeredAt: null },
        data: { ...answer, answeredAt: new Date() },
      });
      if (updated.count === 0) throw new DomainError("QUIZ_ALREADY_ANSWERED");
      // A written answer (daily quiz or assessment) is scored in the background.
      const scores: ScoreRef[] = [];
      if (q.type === "written") {
        scores.push(
          await createQuizItemScore(tx, {
            enrollmentId: attempt.enrollmentId,
            userId,
            day: attempt.day,
            round: attempt.round,
            quizItemId: item.id,
          }),
        );
      }

      const remaining = await tx.quizItem.count({ where: { attemptId, answeredAt: null } });
      let dayCompleted = false;
      if (remaining === 0 && isAssessment) {
        await finishAssessment(tx, attemptId, new Date());
      } else if (remaining === 0) {
        await tx.quizAttempt.updateMany({
          where: { id: attemptId, completedAt: null },
          data: { completedAt: new Date() },
        });
        dayCompleted = await this.completeDayIfDone(tx, {
          enrollmentId: attempt.enrollmentId,
          day: attempt.day,
          round: attempt.round,
        });
      }
      const aiScore = q.type === "written" ? PENDING_SCORE : null;
      return {
        response: asContract(answerQuizItemResponse, {
          result: itemResult(q, { ...item, ...answer, answeredAt: new Date(), aiScore }),
          quizCompleted: remaining === 0,
          dayCompleted,
        }),
        scores,
      };
    });
    await this.scoring.enqueue(scores);
    return response;
  }

  // ── helpers ──────────────────────────────────────────────────────────────────────────────────

  /** Check-ins the engineer's manager recorded, in day order. */
  private async checkins(tx: Tx, enrollmentId: string): Promise<MyPlanResponse["checkins"]> {
    const rows = await tx.checkin.findMany({
      where: { enrollmentId },
      orderBy: { afterDay: "asc" },
      select: { afterDay: true, heldOn: true, rag: true, note: true },
    });
    return rows.map((row) => ({
      afterDay: row.afterDay,
      heldOn: isoFromDate(row.heldOn),
      rag: z.enum(RAG).parse(row.rag),
      note: row.note,
    }));
  }

  /**
   * The entry must have what the lesson asks for (required fields, all ratings, known ticks, proof).
   * Returns the readiness model when the lesson has ratings.
   */
  private async checkEntry(tx: Tx, target: Lesson, body: LessonEntry): Promise<ReadinessModel | null> {
    const needsModel = target.baseline || isScorecardLesson(target);
    const model = needsModel ? await loadReadinessModel(tx) : null;
    if (needsModel && !model) throw new DomainError("DAY_NOT_READY");
    const problems = lessonEntryProblems(target, body, model?.behaviours ?? []);
    const first = Object.values(problems)[0];
    if (first) throw new RequestValidationError(problems, first);
    return model;
  }

  /** The engineer's Day-1 baseline ratings (the rate lesson with `baseline: true`, round 1), or null. */
  private async baseline(
    tx: Tx,
    enrollmentId: string,
    day1: { lessons: Lesson[]; entries: Map<string, SavedEntry> } | null,
  ): Promise<Record<string, number> | null> {
    const lessons = day1?.lessons ?? (await loadDayLessons(tx, 1)) ?? [];
    const rate = lessons.find((item) => item.baseline);
    if (!rate) return null;
    const saved =
      day1?.entries.get(rate.id) ??
      (await tx.stepEntry.findUnique({
        where: { enrollmentId_day_lessonId_round: { enrollmentId, day: 1, lessonId: rate.id, round: 1 } },
        select: { entry: true, doneAt: true },
      }));
    const ratings = saved ? parseEntry(saved.entry).ratings : {};
    return Object.keys(ratings).length > 0 ? ratings : null;
  }

  /**
   * The engineer's saved answers for the day's `recall` blocks (empty strings when not saved). A day
   * done in several rounds shows its latest saved round.
   */
  private async recalls(tx: Tx, enrollmentId: string, lessons: readonly Lesson[]) {
    const wanted = new Map<string, { day: number; lesson: string; fields: Set<string> }>();
    for (const item of lessons) {
      // A lesson that starts from an earlier lesson's answers (Day 64 ← Day 63) gets them as a recall.
      const prefill = item.prefillFrom
        ? [{ day: item.prefillFrom.day, lesson: item.prefillFrom.lesson, fields: item.fields }]
        : [];
      for (const shown of [...item.blocks, ...prefill]) {
        if ("type" in shown && shown.type !== "recall") continue;
        const key = `${shown.day}:${shown.lesson}`;
        const current = wanted.get(key) ?? {
          day: shown.day,
          lesson: shown.lesson,
          fields: new Set<string>(),
        };
        for (const field of shown.fields) current.fields.add(field.id);
        wanted.set(key, current);
      }
    }
    if (wanted.size === 0) return [];
    const rows = await tx.stepEntry.findMany({
      where: { enrollmentId, OR: [...wanted.values()].map((w) => ({ day: w.day, lessonId: w.lesson })) },
      orderBy: { round: "desc" },
      select: { day: true, lessonId: true, entry: true },
    });
    return [...wanted.values()].map((w) => {
      const row = rows.find((r) => r.day === w.day && r.lessonId === w.lesson);
      const values = row ? parseEntry(row.entry).values : {};
      return {
        day: w.day,
        lesson: w.lesson,
        values: Object.fromEntries([...w.fields].map((id) => [id, values[id] ?? ""])),
      };
    });
  }

  /** The day's write-lesson scoring guides (server only; shown as the model answer once saved). */
  private async guides(tx: Tx, day: number): Promise<Map<string, WriteScoringGuide>> {
    const row = await tx.contentDay.findUnique({ where: { day }, select: { writeScoring: true } });
    return parseGuides(row?.writeScoring);
  }

  private async lessonScores(tx: Tx, at: DayRound, lessonId?: string): Promise<Map<string, AiScoreRow>> {
    const rows = await tx.aiScore.findMany({
      where: { ...at, target: "lesson", ...(lessonId ? { lessonId } : {}) },
      select: { lessonId: true, ...AI_SCORE_SELECT },
    });
    return new Map(rows.flatMap(({ lessonId: id, ...row }) => (id ? [[id, row] as const] : [])));
  }

  private async dayScoring(tx: Tx, at: DayRound): Promise<DayScoring> {
    const guides = await this.guides(tx, at.day);
    const scores = guides.size > 0 ? await this.lessonScores(tx, at) : new Map<string, AiScoreRow>();
    return { guides, scores };
  }

  /** The day's saved lessons in the given round. */
  private async lessonEntries(tx: Tx, at: DayRound): Promise<Map<string, SavedEntry>> {
    const rows = await tx.stepEntry.findMany({
      where: at,
      select: { lessonId: true, entry: true, doneAt: true },
    });
    return new Map(rows.map((row) => [row.lessonId, row]));
  }

  private dailyAttempt(tx: Tx, at: DayRound) {
    return tx.quizAttempt.findUnique({
      where: { enrollmentId_kind_day_round_attempt: { ...at, kind: "daily", attempt: DAILY_ATTEMPT } },
      select: { id: true, completedAt: true },
    });
  }

  private async questionPool(tx: Tx, day: number) {
    const rows = await tx.question.findMany({
      where: { pool: dayPool(day), retired: false },
      select: { id: true, type: true, version: true, data: true },
    });
    return rows.map((row) => ({ ...row, type: storedQuestion({ questionData: row.data }).type }));
  }

  private async quizView(tx: Tx, attemptId: string): Promise<QuizViewResponse> {
    const attempt = await tx.quizAttempt.findUniqueOrThrow({
      where: { id: attemptId },
      select: {
        id: true,
        day: true,
        completedAt: true,
        items: { orderBy: { position: "asc" }, select: ITEM_SELECT },
      },
    });
    return asContract(quizViewResponse, {
      attemptId: attempt.id,
      day: attempt.day,
      items: attempt.items.map(quizItemView),
      completedAt: attempt.completedAt?.toISOString() ?? null,
    });
  }

  /** Reflect-lesson rubric self-scores also go to rubric_scores (criteria 1–10; null = didn't come up). */
  private async saveMockRubric(
    tx: Tx,
    learner: Learner,
    at: DayRound,
    rubric: Record<string, number | null>,
  ) {
    const where = { enrollmentId: at.enrollmentId, source: "mock_self", day: at.day, round: at.round };
    await tx.rubricScore.deleteMany({ where });
    const rows = Object.entries(rubric).map(([criterion, score]) => ({
      ...where,
      userId: learner.userId,
      scoredById: learner.userId,
      criterion: Number(criterion),
      score,
    }));
    if (rows.length > 0) await tx.rubricScore.createMany({ data: rows });
  }

  /** Mark the day done when its lessons (and quiz, if it has one) are done. True if this call did it. */
  private async completeDayIfDone(tx: Tx, at: DayRound): Promise<boolean> {
    const { enrollmentId, day, round } = at;
    const lessons = await loadDayLessons(tx, day);
    const entries = await this.lessonEntries(tx, at);
    const attempt = await this.dailyAttempt(tx, at);
    if (!lessons) return false;
    const complete = isDayComplete({
      day,
      lessonIds: lessonIds(lessons),
      doneIds: new Set(entries.keys()),
      quizCompleted: Boolean(attempt?.completedAt),
    });
    if (!complete) return false;
    // Upsert: the progress row normally exists (opening the day creates it), but completion must not
    // depend on the page having been opened through GET /me/days/:day first.
    const existing = await tx.dayProgress.findUnique({
      where: { enrollmentId_day_round: at },
      select: { completedAt: true },
    });
    if (existing?.completedAt) return false;
    const enrollment = await tx.enrollment.findUniqueOrThrow({
      where: { id: enrollmentId },
      select: { userId: true },
    });
    await tx.dayProgress.upsert({
      where: { enrollmentId_day_round: at },
      create: { enrollmentId, userId: enrollment.userId, day, round, completedAt: new Date() },
      update: { completedAt: new Date() },
    });
    return true;
  }
}

function lessonIds(lessons: readonly Lesson[]): string[] {
  return lessons.map((item) => item.id);
}

/** Not enrolled yet: every day waits for a start date. */
function dayStatesOf(learner: Learner | null): DayState[] {
  return (
    learner?.states ??
    Array.from({ length: TOTAL_DAYS }, (_, index) => ({
      day: index + 1,
      status: "locked" as const,
      lockReason: "start_date" as const,
    }))
  );
}

function defaultDayType(day: number) {
  return day === TOTAL_DAYS ? ("final_review" as const) : ("normal" as const);
}

function questionType(value: string): QuestionType {
  return value === "written" || value === "scenario" ? value : "mcq";
}

/**
 * A lesson's state. Write lessons with a scoring guide, once saved: the AI score and the model answer
 * (never before saving, so the guide can't be read ahead).
 */
function toLessonState(
  lesson: Pick<Lesson, "id" | "kind">,
  saved: SavedEntry | undefined,
  scoring: DayScoring | null,
): LessonState {
  const guide = saved && lesson.kind === "write" ? scoring?.guides.get(lesson.id) : undefined;
  const score = guide ? scoring?.scores.get(lesson.id) : undefined;
  return {
    id: lesson.id,
    done: saved !== undefined,
    doneAt: saved?.doneAt.toISOString() ?? null,
    entry: saved ? parseEntry(saved.entry) : null,
    aiScore: score ? toAiScore(score) : null,
    modelAnswer: guide?.modelAnswer ?? null,
  };
}

/** The columns to store for an answer; the request shape must match the question type. */
function answerFields(q: ReturnType<typeof storedQuestion>, body: AnswerQuizItemRequest) {
  if (q.type === "written") {
    if (!("text" in body))
      throw new RequestValidationError({ text: "Write your answer." }, "Write your answer.");
    return { textAnswer: body.text, choice: null, correct: null };
  }
  const options = q.options ?? [];
  if (!("choice" in body) || body.choice >= options.length) {
    throw new RequestValidationError({ choice: "Choose an answer." }, "Choose an answer.");
  }
  return { choice: body.choice, correct: options[body.choice]?.correct ?? false, textAnswer: null };
}
