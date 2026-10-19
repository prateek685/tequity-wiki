import { type Lesson, type LessonEntry, SCORECARD_FIELDS } from "@portal/contracts";
import { type BehaviourPillar, pillarsOf } from "./scorecard.js";

/**
 * Lesson rules for the course player (docs/LESSON_FORMAT.md). Pure: the caller loads the day's lessons,
 * the saved entries and the `learning.unlockAll` setting.
 */

export type LessonRules = Pick<
  Lesson,
  "fields" | "checks" | "rounds" | "rubric" | "baseline" | "scorecard" | "kind"
>;

export const PROOF_MESSAGE = "Write one or two lines of proof.";
export const RUBRIC_MESSAGE = "Score the call on at least one criterion.";
export const LIVE_PATH_MESSAGE = "Choose what happened with today's live call.";

/**
 * What a saved entry must contain for its lesson. Returns field → message for each problem (form
 * fields as `values.<id>`); empty means the entry can be saved. A scorecard lesson also takes
 * `proof-<pillar>` (required for each pillar it rates), `win` and `stuck` (optional).
 */
export function lessonEntryProblems(
  lesson: LessonRules,
  entry: LessonEntry,
  behaviours: readonly BehaviourPillar[],
): Record<string, string> {
  const problems: Record<string, string> = {};
  const proofIds = pillarsOf(lesson.scorecard, behaviours).map(SCORECARD_FIELDS.proof);
  const scorecardIds =
    lesson.scorecard.length > 0 ? [...proofIds, SCORECARD_FIELDS.win, SCORECARD_FIELDS.stuck] : [];
  const fieldIds = new Set([...lesson.fields.map((field) => field.id), ...scorecardIds]);
  for (const id of Object.keys(entry.values)) {
    if (!fieldIds.has(id)) problems[`values.${id}`] = "This lesson doesn't have that field.";
  }
  for (const field of lesson.fields) {
    if (field.required && (entry.values[field.id] ?? "").trim() === "")
      problems[`values.${field.id}`] = "Fill this in.";
  }
  for (const id of proofIds) {
    if ((entry.values[id] ?? "").trim() === "") problems[`values.${id}`] = PROOF_MESSAGE;
  }

  if (entry.checked.some((index) => index >= lesson.checks.length))
    problems.checked = "That item doesn't exist.";

  const rated = Object.keys(entry.ratings);
  const behaviourIds = behaviours.map((behaviour) => behaviour.id);
  if (lesson.baseline) {
    const known = new Set(behaviourIds);
    if (rated.some((id) => !known.has(id)) || behaviourIds.some((id) => entry.ratings[id] === undefined))
      problems.ratings = "Rate every behaviour from 1 to 5.";
  } else if (lesson.scorecard.length > 0) {
    const wanted = new Set(lesson.scorecard);
    if (rated.some((id) => !wanted.has(id)) || lesson.scorecard.some((id) => entry.ratings[id] === undefined))
      problems.ratings = "Rate each behaviour from 1 to 5.";
  } else if (rated.length > 0) {
    problems.ratings = "This lesson has no ratings.";
  }

  if (entry.rounds.length > (lesson.rounds ?? 0))
    problems.rounds = lesson.rounds ? `Up to ${lesson.rounds} rounds.` : "This lesson has no rounds.";

  if (!lesson.rubric && Object.keys(entry.rubric).length > 0) problems.rubric = "This lesson has no rubric.";
  // A mock log: n/a (null) is allowed, but at least one criterion must be scored.
  if (lesson.rubric && !Object.values(entry.rubric).some((score) => score !== null))
    problems.rubric = RUBRIC_MESSAGE;

  if (lesson.kind === "live" && entry.livePath === null) problems.livePath = LIVE_PATH_MESSAGE;
  if (lesson.kind !== "live" && entry.livePath !== null) problems.livePath = "This lesson has no live call.";
  return problems;
}

/** True when every lesson of the day is saved. */
export function allLessonsDone(lessonIds: readonly string[], doneIds: ReadonlySet<string>): boolean {
  return lessonIds.every((id) => doneIds.has(id));
}
