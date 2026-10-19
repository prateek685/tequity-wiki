import {
  block,
  type Block,
  type CardPublic,
  cardPublic,
  DAY_TYPES,
  type DayType,
  type Lesson,
  lesson,
  type ReadinessModel,
  readinessModel,
} from "@portal/contracts";
import { z } from "zod";
import { type Tx } from "../prisma/prisma.service.js";

/**
 * `content_days.data` as the import stores it: the day file's story date, minutes, intro and lessons
 * (docs/LESSON_FORMAT.md). The AI scoring guide is in `write_scoring` and never read here.
 */
export const storedDay = z.object({
  storyDate: z.string(),
  minutes: z.string(),
  intro: z.string(),
  lessons: z.array(lesson),
});
export type StoredDay = z.infer<typeof storedDay>;

/** A day as the course player shows it (without the engineer's progress). */
export interface DayContent {
  day: number;
  title: string;
  type: DayType;
  storyDate: string;
  minutes: string;
  intro: string;
  block: Block;
  lessons: Lesson[];
  /** Cards used by the day's mock lessons, in lesson order. */
  cards: CardPublic[];
  model: ReadinessModel;
}

/** The plan's phases (content/plan.yaml), stored with the readiness model. */
const storedPhases = z.object({
  phases: z.array(
    z.object({
      number: z.number().int(),
      name: z.string(),
      fromDay: z.number().int(),
      toDay: z.number().int(),
    }),
  ),
});
export type Phase = z.infer<typeof storedPhases>["phases"][number];

export function dayType(value: string): DayType {
  return z.enum(DAY_TYPES).parse(value);
}

export function dayPool(day: number): string {
  return `day-${String(day).padStart(2, "0")}`;
}

export function assessmentPool(day: number): string {
  return `assessment-${String(day).padStart(2, "0")}`;
}

/** The lessons of an imported day, or null when the day isn't imported. */
export async function loadDayLessons(tx: Tx, day: number): Promise<Lesson[] | null> {
  const row = await tx.contentDay.findUnique({ where: { day }, select: { data: true } });
  return row ? storedDay.parse(row.data).lessons : null;
}

/** The cards the day's mock lessons use (each once, in lesson order). */
export function mockCardIds(lessons: readonly Lesson[]): string[] {
  const ids = lessons.flatMap((item) => {
    if (item.kind === "mock" && item.cardId) return [item.cardId];
    // A live lesson's substitute mock (when there's no live call).
    if (item.kind === "live" && item.substituteCardId) return [item.substituteCardId];
    return [];
  });
  return [...new Set(ids)];
}

/** The readiness model from content/plan.yaml, or null before the plan is imported. */
export async function loadReadinessModel(tx: Tx): Promise<ReadinessModel | null> {
  const row = await tx.contentPlan.findUnique({ where: { id: 1 }, select: { data: true } });
  return row ? readinessModel.parse(row.data) : null;
}

/** The plan's phases, or [] before the plan is imported. */
export async function loadPhases(tx: Tx): Promise<Phase[]> {
  const row = await tx.contentPlan.findUnique({ where: { id: 1 }, select: { data: true } });
  return row ? storedPhases.parse(row.data).phases : [];
}

/** The imported day with its cards and the model, or null when it (or the plan) isn't imported. */
export async function loadDayContent(tx: Tx, day: number): Promise<DayContent | null> {
  const row = await tx.contentDay.findUnique({
    where: { day },
    select: { day: true, title: true, type: true, data: true, block: { select: { data: true } } },
  });
  const model = await loadReadinessModel(tx);
  if (!row || !model) return null;
  const { storyDate, minutes, intro, lessons } = storedDay.parse(row.data);
  const ids = mockCardIds(lessons);
  const cardRows = ids.length
    ? await tx.contentCard.findMany({ where: { id: { in: ids } }, select: { id: true, data: true } })
    : [];
  const cards = ids.flatMap((id) => {
    const card = cardRows.find((c) => c.id === id);
    return card ? [cardPublic.parse(card.data)] : [];
  });
  return {
    day: row.day,
    title: row.title,
    type: dayType(row.type),
    storyDate,
    minutes,
    intro,
    block: block.parse(row.block.data),
    lessons,
    cards,
    model,
  };
}
