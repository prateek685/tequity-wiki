import {
  type Behaviour,
  type CourseOutlineResponse,
  type DayViewResponse,
  LESSON_KIND_LABELS,
  type LessonEntry,
  type LessonKind,
  type LessonState,
  type OutlineDay,
  type Pillar,
  PILLARS,
  SCORECARD_FIELDS,
} from "@portal/contracts";

/**
 * Course player rules (docs/LESSON_FORMAT.md): a day is its lessons in order, then the daily quiz.
 * Pure: unit-tested. The quiz is addressed by the lesson id "quiz" in the URL.
 */

export const QUIZ_ID = "quiz";
export const QUIZ_TITLE = "Check yourself";
export const QUIZ_META = "Quiz · 5 questions";

export interface PlayerItem {
  id: string;
  title: string;
  /** "Read · 8 min" / "Quiz · 5 questions". */
  meta: string;
  kind: LessonKind | "quiz";
}

type DayShape = Pick<DayViewResponse, "lessons" | "progress" | "quiz">;

/** "Read · 8 min". */
export function lessonMeta(lesson: { kind: LessonKind; minutes: string }): string {
  return `${LESSON_KIND_LABELS[lesson.kind]} · ${lesson.minutes}`;
}

/** The day's lessons, then the quiz (unless the day has none). */
export function dayItems(day: Pick<DayViewResponse, "lessons" | "quiz">): PlayerItem[] {
  const lessons: PlayerItem[] = day.lessons.map((lesson) => ({
    id: lesson.id,
    title: lesson.title,
    meta: lessonMeta(lesson),
    kind: lesson.kind,
  }));
  if (day.quiz.status === "none") return lessons;
  return [...lessons, { id: QUIZ_ID, title: QUIZ_TITLE, meta: QUIZ_META, kind: "quiz" }];
}

export function lessonState(day: Pick<DayViewResponse, "progress">, id: string): LessonState | undefined {
  return day.progress.find((state) => state.id === id);
}

export function itemDone(day: DayShape, id: string): boolean {
  if (id === QUIZ_ID) return day.quiz.status === "done";
  return lessonState(day, id)?.done ?? false;
}

/** Lessons open in any order; the quiz waits for every lesson (the server decides). */
export function itemLocked(day: DayShape, id: string): boolean {
  return id === QUIZ_ID && day.quiz.status === "locked";
}

/**
 * Where /app/day/N opens: the first lesson not done yet; when every lesson is done, the quiz (if it
 * isn't finished); otherwise the first lesson. Null when the day has no lessons (not imported).
 */
export function startItem(day: DayShape): string | null {
  const open = day.lessons.find((lesson) => !itemDone(day, lesson.id) && !itemLocked(day, lesson.id));
  if (open) return open.id;
  const allDone = day.lessons.every((lesson) => itemDone(day, lesson.id));
  if (allDone && (day.quiz.status === "ready" || day.quiz.status === "in_progress")) return QUIZ_ID;
  return day.lessons[0]?.id ?? (day.quiz.status === "none" ? null : QUIZ_ID);
}

/** "Day 1 · Lesson 3 of 6 · Mock call · 15 min". Only mock calls name their kind (as in the mockup). */
export function kicker(
  day: number,
  index: number,
  total: number,
  item: PlayerItem,
  minutes?: string,
): string {
  const base = `Day ${day} · Lesson ${index + 1} of ${total}`;
  if (item.kind === "quiz") return `${base} · ${QUIZ_META}`;
  if (item.kind === "mock") return `${base} · ${LESSON_KIND_LABELS.mock} · ${minutes ?? ""}`;
  return `${base} · ${minutes ?? ""}`;
}

/** Lessons done (+ the finished quiz) out of all items: the outline's "n/total". */
export function outlineCount(day: OutlineDay): { done: number; total: number } {
  const hasQuiz = day.quiz.status !== "none";
  const done = day.lessons.filter((lesson) => lesson.done).length + (day.quiz.status === "done" ? 1 : 0);
  return { done, total: day.lessons.length + (hasQuiz ? 1 : 0) };
}

export function outlineDay(course: CourseOutlineResponse | undefined, day: number): OutlineDay | undefined {
  return course?.weeks.flatMap((week) => week.days).find((entry) => entry.day === day);
}

/** A day can be opened from the outline (or by "Finish Day N → Day N+1"). */
export function dayOpen(day: OutlineDay | undefined): boolean {
  return day !== undefined && day.lessons.length > 0 && (day.status === "open" || day.status === "done");
}

/** The last item of a day (its quiz, or the last lesson on a day without one). */
export function lastItemOf(day: OutlineDay): string | null {
  if (day.quiz.status !== "none") return QUIZ_ID;
  return day.lessons.at(-1)?.id ?? null;
}

export const EMPTY_ENTRY: LessonEntry = {
  values: {},
  checked: [],
  ratings: {},
  rounds: [],
  rubric: {},
  realProject: false,
  livePath: null,
};

/**
 * The entry a lesson's form starts from: the saved one, with `rounds` sized to the lesson. A lesson not
 * saved yet can start from an earlier lesson's answers (`prefill`, e.g. Day 64 from the Day 63 draft).
 */
export function startEntry(
  saved: LessonEntry | null | undefined,
  rounds = 0,
  prefill?: Readonly<Record<string, string>>,
): LessonEntry {
  const entry = saved ?? {
    ...EMPTY_ENTRY,
    values: Object.fromEntries(Object.entries(prefill ?? {}).filter(([, v]) => v !== "")),
  };
  const roundList = Array.from(
    { length: rounds },
    (_, index) => entry.rounds[index] ?? { score: null, fix: "" },
  );
  return { ...EMPTY_ENTRY, ...entry, rounds: roundList };
}

/** Client-side check before saving: required fields, every rating the lesson asks for, scorecard proof, rubric. */
export function missingParts(
  lesson: Pick<DayViewResponse["lessons"][number], "fields" | "baseline" | "scorecard" | "rubric" | "kind">,
  entry: LessonEntry,
  behaviours: readonly Pick<Behaviour, "id" | "pillar">[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of lesson.fields)
    if (field.required && (entry.values[field.id] ?? "").trim() === "") errors[field.id] = "Fill this in.";
  const needed = lesson.baseline ? behaviours.map((behaviour) => behaviour.id) : lesson.scorecard;
  if (needed.some((id) => entry.ratings[id] === undefined))
    errors.ratings = "Rate every behaviour from 1 to 5.";
  for (const pillar of ratedPillars(lesson.scorecard, behaviours)) {
    const id = SCORECARD_FIELDS.proof(pillar);
    if ((entry.values[id] ?? "").trim() === "") errors[id] = PROOF_MISSING;
  }
  if (lesson.rubric && !Object.values(entry.rubric).some((score) => score !== null))
    errors.rubric = RUBRIC_MISSING;
  if (lesson.kind === "live" && entry.livePath === null) errors.livePath = LIVE_PATH_MISSING;
  return errors;
}

export const PROOF_MISSING = "Write one or two lines of proof.";
export const RUBRIC_MISSING = "Score the call on at least one criterion.";
export const LIVE_PATH_MISSING = "Choose what happened with today's live call.";

/** The pillars a scorecard rates (those of its listed behaviours), in pillar order. */
export function ratedPillars(
  scorecard: readonly string[],
  behaviours: readonly Pick<Behaviour, "id" | "pillar">[],
): Pillar[] {
  const pillars = new Set(
    scorecard.flatMap((id) => behaviours.filter((behaviour) => behaviour.id === id).map((b) => b.pillar)),
  );
  return PILLARS.filter((pillar) => pillars.has(pillar));
}

/** The API's VALIDATION `fields` keys ("values.q1", "ratings.U1", "q1") → our keys (field id / "ratings"). */
export function mapFieldErrors(fields: Record<string, string> | undefined): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const [key, message] of Object.entries(fields ?? {})) {
    const [head, rest] = [key.split(".")[0] ?? key, key.split(".").slice(1).join(".")];
    if (head === "values" && rest) errors[rest] = message;
    else if (head === "ratings") errors.ratings ??= message;
    else errors[key] = message;
  }
  return errors;
}
