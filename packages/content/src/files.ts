import {
  behaviour,
  block,
  cardPublic,
  DAY_TYPES,
  lesson,
  lessonId,
  libraryEntry,
  md,
  question,
  questionOption,
  questionSource,
  readinessPillar,
  rubricCriterion,
  scaleLevel,
} from "@portal/contracts";
import { z } from "zod";

/**
 * Shapes of the YAML files in `content/` (docs/LESSON_FORMAT.md). One file per item, so every change
 * shows up clearly in git:
 *
 *   content/plan.yaml                     phases, pillars, the 14 behaviours, the 1–5 scale, rubric
 *   content/blocks/block-01.yaml          a 5-day block ("Days 1–5"): number, title, phase, goal
 *   content/days/day-01.yaml              one lesson day
 *   content/cards/S01.yaml                a mock card: short brief + the private AI prompt
 *   content/library/<id>.yaml             a Library page (framework, template, prompt, glossary, resource)
 *   content/questions/day-01.yaml         the daily quiz pool for Day 1
 *   content/questions/assessment-05.yaml  the assessment pool after Day 5
 *
 * File schemas are strict: an unknown key is an error. That catches typos and YAML slips such as an
 * unquoted comma inside `{ … }`, which silently splits a value into a second key.
 */

export const planFile = z.strictObject({
  phases: z
    .array(
      z.strictObject({
        number: z.number().int().min(1).max(3),
        name: z.string().min(1),
        fromDay: z.number().int().min(1).max(65),
        toDay: z.number().int().min(1).max(65),
      }),
    )
    .length(3),
  pillars: z.array(readinessPillar.strict()).length(4),
  behaviours: z.array(behaviour.strict()).length(14),
  scale: z.array(scaleLevel.strict()).length(5),
  rubric: z.array(rubricCriterion.strict()).length(11),
});
export type PlanFile = z.infer<typeof planFile>;

export const blockFile = block.strict();
export type BlockFile = z.infer<typeof blockFile>;

export const dayFile = z.strictObject({
  day: z.number().int().min(1).max(65),
  block: z.number().int().min(1).max(13),
  title: z.string().min(1),
  type: z.enum(DAY_TYPES),
  /** The date in the CareBook story, e.g. "Monday, March 2". */
  storyDate: z.string().trim().min(1),
  /** e.g. "About 60 min". */
  minutes: z.string().trim().min(1),
  /** 1–2 lines for the My plan page. */
  intro: md,
  /** In order; the daily quiz comes last and isn't listed. */
  lessons: z.array(lesson.strict()).min(1),
  /**
   * How a write lesson is AI-scored (from M2), by lesson id: a model answer and 2–3 scoring points.
   * Server only; never sent to engineers before they submit.
   */
  scoring: z
    .record(lessonId, z.strictObject({ modelAnswer: md, scoringPoints: z.array(z.string().min(1)).min(2).max(3) }))
    .optional(),
});
export type DayFile = z.infer<typeof dayFile>;

export const cardFile = cardPublic
  .extend({
    script: z.array(z.strictObject({ step: z.string().min(1), line: md })).default([]),
    /** The AI prompt, word for word. Private: admins can view it, engineers can only copy it. */
    prompt: md,
  })
  .strict();
export type CardFile = z.infer<typeof cardFile>;

/** One Library page (content/library/<id>.yaml): a framework, template, AI prompt, glossary or resource. */
export const libraryFile = libraryEntry.strict();
export type LibraryFile = z.infer<typeof libraryFile>;

const questionFile = question
  .extend({
    options: z.array(questionOption.strict()).optional(),
    source: questionSource.strict(),
  })
  .strict();

export const questionPoolFile = z.strictObject({
  pool: z.string().regex(/^(day|assessment)-\d{2}$/),
  questions: z.array(questionFile).min(1),
});
export type QuestionPoolFile = z.infer<typeof questionPoolFile>;

/** Everything in `content/`, parsed and validated file by file. */
export interface ContentBundle {
  plan: PlanFile | null;
  blocks: BlockFile[];
  days: DayFile[];
  cards: CardFile[];
  library: LibraryFile[];
  pools: QuestionPoolFile[];
}
