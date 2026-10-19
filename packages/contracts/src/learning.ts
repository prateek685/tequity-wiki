import { z } from "zod";
import { isoDate, isoDateTime, RAG } from "./common.js";
import {
  behaviourId,
  block,
  cardPublic,
  DAY_TYPES,
  LESSON_KINDS,
  lesson,
  lessonId,
  QUESTION_TYPES,
  readinessModel,
} from "./content.js";
import { finalReviewSummary, LIVE_PATHS } from "./final-review.js";
import { gateSummary } from "./gates.js";
import { aiScore } from "./scoring.js";

/**
 * Engineer learning API (docs/LESSON_FORMAT.md). Days 1–65, grouped in weeks of 5 that follow the
 * CareBook story. A day is a list of lessons done in order in the course player, then the daily quiz.
 * While the `learning.unlockAll` setting is on (content review), every imported day and lesson is open.
 */

export const dayParam = z.object({ day: z.coerce.number().int().min(1).max(65) });
export const lessonParam = dayParam.extend({ lesson: lessonId });

/**
 * locked: an earlier day or a checkpoint isn't done yet · open: can be worked on · done: quiz finished
 * (or, on Day 65, the final lessons) · not_ready: the lesson isn't imported yet.
 */
export const DAY_STATUSES = ["locked", "open", "done", "not_ready"] as const;
export type DayStatus = (typeof DAY_STATUSES)[number];

/** Why a day is locked; the UI shows a plain sentence for each. */
export const LOCK_REASONS = ["start_date", "previous_day", "assessment", "scorecard", "gate"] as const;
export type LockReason = (typeof LOCK_REASONS)[number];

export const PACE_STATUSES = ["not_started", "ahead", "on_pace", "behind"] as const;
export type PaceStatus = (typeof PACE_STATUSES)[number];

export const pace = z.object({
  status: z.enum(PACE_STATUSES),
  daysDone: z.number().int().min(0),
  /** Days that should be done by today to finish Day 65 by the target date. */
  expectedDone: z.number().int().min(0),
  /** Positive when behind, negative when ahead. */
  difference: z.number().int(),
  targetDate: isoDate,
});
export type Pace = z.infer<typeof pace>;

/** A bi-weekly check-in as the engineer sees it (recorded by their manager, docs/PORTAL_PLAN.md M4). */
export const checkinSummary = z.object({
  afterDay: z.number().int(),
  heldOn: isoDate,
  rag: z.enum(RAG),
  note: z.string(),
});
export type CheckinSummary = z.infer<typeof checkinSummary>;

export const planDay = z.object({
  day: z.number().int(),
  title: z.string(),
  blockNumber: z.number().int(),
  type: z.enum(DAY_TYPES),
  status: z.enum(DAY_STATUSES),
  lockReason: z.enum(LOCK_REASONS).nullable(),
  /** 1, or 2+ when the day was reopened by a repeat after a gate (the earlier round is kept). */
  round: z.number().int().min(1).default(1),
});
export type PlanDay = z.infer<typeof planDay>;

/** GET /api/me/plan — all 65 days with status, pace, and the day to continue. */
export const myPlanResponse = z.object({
  enrollment: z.object({ startDate: isoDate, targetDate: isoDate }).nullable(),
  pace: pace.nullable(),
  /** The lowest open day, or null when nothing is open. */
  currentDay: z.number().int().nullable(),
  days: z.array(planDay),
  /** Check-ins recorded by the manager (after Days 10, 30, 50, 60). */
  checkins: z.array(checkinSummary),
  /** Gate 1 (after Day 20); Gate 2 from M6. */
  gates: z.array(gateSummary).default([]),
  /** The final review after Day 64 (M7); null before its content is imported. */
  finalReview: finalReviewSummary.nullable().default(null),
});
export type MyPlanResponse = z.infer<typeof myPlanResponse>;

// ── Lesson entries (all private to the engineer) ────────────────────────────────────────────────

/** Rubric criteria 1–10 copied from the AI's feedback; null = didn't come up. */
export const mockRubric = z.record(
  z.string().regex(/^(10|[1-9])$/),
  z.number().int().min(1).max(5).nullable(),
);

/** Day-1 baseline or a Friday scorecard: behaviour → 1–5. */
export const behaviourRatings = z.record(behaviourId, z.number().int().min(1).max(5));
export type BehaviourRatings = z.infer<typeof behaviourRatings>;

/**
 * What the engineer saved for one lesson. One shape for every kind; the server checks the parts the
 * lesson asks for (required fields, all baseline/scorecard behaviours rated, known check indexes).
 */
export const lessonEntry = z.object({
  /** Form field id → text. */
  values: z.record(z.string().regex(/^[a-z][a-z0-9-]{0,30}$/), z.string().trim().max(20_000)).default({}),
  /** Ticked check indexes. */
  checked: z.array(z.number().int().min(0).max(50)).max(50).default([]),
  /** Baseline / scorecard ratings. */
  ratings: behaviourRatings.default({}),
  /** Repeat-the-call rounds: score 1–5 (null = not rated) and the AI's one fix. */
  rounds: z
    .array(z.object({ score: z.number().int().min(1).max(5).nullable(), fix: z.string().trim().max(2000) }))
    .max(5)
    .default([]),
  /** Reflect lessons with `rubric: true`. */
  rubric: mockRubric.default({}),
  /**
   * Write lessons with `source: both | real_project`: the engineer used their own project's material.
   * Not AI-scored while the setting `ai.scoreRealProjectAnswers` is off.
   */
  realProject: z.boolean().default(false),
  /** Live lessons, required there: what happened with today's live call. */
  livePath: z.enum(LIVE_PATHS).nullable().default(null),
});
export type LessonEntry = z.infer<typeof lessonEntry>;

/** PUT /api/me/days/:day/lessons/:lesson — save the lesson's entry and mark it done. */
export const saveLessonRequest = lessonEntry;
export type SaveLessonRequest = z.infer<typeof saveLessonRequest>;

export const lessonState = z.object({
  id: lessonId,
  done: z.boolean(),
  doneAt: isoDateTime.nullable(),
  /** The engineer's own saved entry (never shown to anyone else). */
  entry: lessonEntry.nullable(),
  /** Write lessons with a scoring guide, once saved: the AI score of the saved answer (else null). */
  aiScore: aiScore.nullable(),
  /** Write lessons with a scoring guide, once saved: the model answer to compare with (else null). */
  modelAnswer: z.string().nullable(),
});
export type LessonState = z.infer<typeof lessonState>;

export const QUIZ_STATUSES = ["locked", "ready", "in_progress", "done", "not_ready", "none"] as const;
/** locked: lessons not done · not_ready: too few questions in the pool · none: the day has no quiz (Day 65). */
export type QuizStatus = (typeof QUIZ_STATUSES)[number];

/** A saved answer from an earlier lesson, for a `recall` block (field id → text; empty when not saved). */
export const recalled = z.object({
  day: z.number().int(),
  lesson: lessonId,
  values: z.record(z.string(), z.string()),
});

/** GET /api/me/days/:day — the day as the course player shows it, with the engineer's progress. */
export const dayViewResponse = z.object({
  day: z.number().int(),
  title: z.string(),
  type: z.enum(DAY_TYPES),
  /** e.g. "Monday, March 2": the date in the CareBook story, not the engineer's calendar. */
  storyDate: z.string(),
  /** e.g. "About 60 min". */
  minutes: z.string(),
  intro: z.string(),
  status: z.enum(DAY_STATUSES),
  lockReason: z.enum(LOCK_REASONS).nullable(),
  /** 1, or 2+ when the day is being repeated after a gate; entries and quiz shown are the current round's. */
  round: z.number().int().min(1).default(1),
  /** The week (5 days). */
  block,
  /** In order; the daily quiz comes last and isn't listed. */
  lessons: z.array(lesson),
  progress: z.array(lessonState),
  /** Cards used by the day's mock lessons. */
  cards: z.array(cardPublic),
  /** The readiness model (pillars, behaviours, scale, rubric). */
  model: readinessModel,
  /** The engineer's Day-1 baseline ratings (for scorecards), or null before it's saved. */
  baseline: z.record(z.string(), z.number().int()).nullable(),
  /** Answers for this day's `recall` blocks. */
  recalls: z.array(recalled),
  /** Days with a scorecard lesson: this week's days completed (the 5th day counts once its other lessons are done) and mock lessons saved. */
  weekStats: z.object({ daysCompleted: z.number().int(), mocksDone: z.number().int() }).nullable(),
  quiz: z.object({ status: z.enum(QUIZ_STATUSES), attemptId: z.uuid().nullable() }),
  /** True while lessons and days aren't locked (content review). */
  unlockAll: z.boolean(),
  /** Days with a live lesson: the Phase 3 live-call plan the manager recorded at Gate 2, null if none. */
  livePlan: z.string().nullable().default(null),
  /** Days with a `pillarCompare` block: per pillar, the Day-1 baseline and the latest scorecard score. */
  pillarNow: z
    .array(z.object({ pillar: z.string(), dayOne: z.number().nullable(), now: z.number().nullable() }))
    .nullable()
    .default(null),
});
export type DayViewResponse = z.infer<typeof dayViewResponse>;

/** One day in the course outline. */
export const outlineDay = z.object({
  day: z.number().int(),
  title: z.string(),
  storyDate: z.string(),
  type: z.enum(DAY_TYPES),
  status: z.enum(DAY_STATUSES),
  lockReason: z.enum(LOCK_REASONS).nullable(),
  /** Empty when the day isn't imported yet ("Coming soon"). */
  lessons: z.array(
    z.object({
      id: lessonId,
      title: z.string(),
      kind: z.enum(LESSON_KINDS),
      minutes: z.string(),
      done: z.boolean(),
    }),
  ),
  quiz: z.object({ status: z.enum(QUIZ_STATUSES) }),
  round: z.number().int().min(1).default(1),
});
export type OutlineDay = z.infer<typeof outlineDay>;

/** The assessment row in a week of the outline (after the week's 5th day). */
export const outlineAssessment = z.object({
  day: z.number().int(),
  status: z.enum(["locked", "not_ready", "ready", "in_progress", "passed", "failed"]),
});

/** GET /api/me/course — the course outline for the player: phases → weeks → days → lessons. */
export const courseOutlineResponse = z.object({
  currentDay: z.number().int().nullable(),
  unlockAll: z.boolean(),
  phases: z.array(z.object({ number: z.number().int(), name: z.string() })),
  weeks: z.array(
    z.object({
      number: z.number().int(),
      title: z.string(),
      phase: z.number().int(),
      days: z.array(outlineDay),
      /** Null for weeks without an assessment (Week 13). */
      assessment: outlineAssessment.nullable(),
      /** The gate after this week (Week 4: Gate 1), else null. */
      gate: gateSummary.nullable().default(null),
      /** Week 13: the final review after Day 64, else null. */
      finalReview: finalReviewSummary.nullable().default(null),
    }),
  ),
});
export type CourseOutlineResponse = z.infer<typeof courseOutlineResponse>;

/** POST /api/me/days/:day/lessons/:lesson/prompt-copy — the mock card's AI prompt for the clipboard (audited). */
export const promptCopyResponse = z.object({ prompt: z.string() });
export type PromptCopyResponse = z.infer<typeof promptCopyResponse>;

// ── Daily quiz ──────────────────────────────────────────────────────────────────────────────────

export const quizItemResult = z.object({
  /** Multiple choice and scenario. */
  choice: z.number().int().min(0).max(3).nullable(),
  correct: z.boolean().nullable(),
  correctIndex: z.number().int().min(0).max(3).nullable(),
  /** An explanation for every option, in option order. */
  explanations: z.array(z.string()),
  /** Written. */
  text: z.string().nullable(),
  modelAnswer: z.string().nullable(),
  /** Kept for older clients: mirrors `aiScore.status` (not_scored counts as failed). */
  scoreStatus: z.enum(["not_applicable", "pending", "scored", "failed"]),
  /** Written answers once submitted: the AI score (pending at first). Null for choice questions. */
  aiScore: aiScore.nullable(),
});
export type QuizItemResult = z.infer<typeof quizItemResult>;

export const quizItem = z.object({
  position: z.number().int().min(0),
  type: z.enum(QUESTION_TYPES),
  stem: z.string(),
  clientLine: z.string().nullable(),
  /** Option texts for multiple choice and scenario (correct answers are never sent before answering). */
  options: z.array(z.string()).nullable(),
  result: quizItemResult.nullable(),
});
export type QuizItem = z.infer<typeof quizItem>;

/** POST /api/me/days/:day/quiz — start the daily quiz or resume the open attempt. */
export const quizViewResponse = z.object({
  attemptId: z.uuid(),
  day: z.number().int(),
  items: z.array(quizItem),
  completedAt: isoDateTime.nullable(),
});
export type QuizViewResponse = z.infer<typeof quizViewResponse>;

export const quizAttemptParam = z.object({ attemptId: z.uuid() });
export const quizItemParam = quizAttemptParam.extend({ position: z.coerce.number().int().min(0).max(30) });

/** POST /api/me/quiz/:attemptId/items/:position — answer one question (once; answers can't be changed). */
export const answerQuizItemRequest = z.union([
  z.object({ choice: z.number().int().min(0).max(3) }),
  z.object({ text: z.string().trim().min(1, "Write your answer.").max(5000) }),
]);
export type AnswerQuizItemRequest = z.infer<typeof answerQuizItemRequest>;

export const answerQuizItemResponse = z.object({
  result: quizItemResult,
  /** True when this answer finished the attempt (daily quiz or assessment). */
  quizCompleted: z.boolean(),
  /** True when this answer completed the day. */
  dayCompleted: z.boolean(),
});
export type AnswerQuizItemResponse = z.infer<typeof answerQuizItemResponse>;

// ── Weekly assessment (after Days 5, 10 … 60) ───────────────────────────────────────────────────

/** The assessment follows this day (5, 10 … 60): `assessmentParam.day`. */
export const assessmentParam = z.object({
  day: z.coerce
    .number()
    .int()
    .min(5)
    .max(60)
    .refine((day) => day % 5 === 0, "Assessments follow every 5th day."),
});

/**
 * locked: the week's days aren't done yet · not_ready: no question pool imported · ready: can start ·
 * in_progress: an attempt is open · passed · failed: the last attempt failed; `retakeAt` says when the
 * next one opens (null or in the past = can retake now).
 */
export const ASSESSMENT_STATUSES = [
  "locked",
  "not_ready",
  "ready",
  "in_progress",
  "passed",
  "failed",
] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

export const assessmentRules = z.object({
  questions: z.number().int(),
  /** Multiple choice + scenario. */
  choiceQuestions: z.number().int(),
  writtenQuestions: z.number().int(),
  /** Pass mark on the multiple-choice questions only (admin setting `assessment.passPercent`, default 60). */
  passPercent: z.number().int().min(1).max(100),
  /** Wait before a retake (setting `assessment.retakeHours`, default 24). */
  retakeHours: z.number().int().min(0),
});
export type AssessmentRules = z.infer<typeof assessmentRules>;

export const assessmentResult = z.object({
  choiceCorrect: z.number().int().min(0),
  choiceTotal: z.number().int().min(0),
  /** Rounded down. */
  percent: z.number().int().min(0).max(100),
  passed: z.boolean(),
  /** Failed only: when the retake opens. */
  retakeAt: isoDateTime.nullable(),
});
export type AssessmentResult = z.infer<typeof assessmentResult>;

/** GET /api/me/assessments/:day and POST …/start — the assessment screen. */
export const assessmentViewResponse = z.object({
  day: z.number().int(),
  week: z.number().int(),
  weekTitle: z.string(),
  status: z.enum(ASSESSMENT_STATUSES),
  /** True when a retake can be started now (status failed and the wait is over). */
  canRetake: z.boolean(),
  rules: assessmentRules,
  /** The latest attempt (open or finished), or null before the first start. */
  attempt: z
    .object({
      id: z.uuid(),
      number: z.number().int().min(1),
      items: z.array(quizItem),
      completedAt: isoDateTime.nullable(),
      result: assessmentResult.nullable(),
    })
    .nullable(),
  /** Earlier finished attempts, newest first. */
  history: z.array(
    z.object({ number: z.number().int(), completedAt: isoDateTime, result: assessmentResult }),
  ),
  /** True while `learning.unlockAll` is on: the assessment doesn't block the next day. */
  unlockAll: z.boolean(),
});
export type AssessmentViewResponse = z.infer<typeof assessmentViewResponse>;
