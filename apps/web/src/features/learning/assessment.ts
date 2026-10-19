import {
  type AssessmentRules,
  type AssessmentStatus,
  type AssessmentViewResponse,
  type CourseOutlineResponse,
} from "@portal/contracts";

/**
 * Weekly assessment rules for the player (docs/design/course-player.html, "Week 1 assessment").
 * Pure: unit-tested. The assessment follows every 5th day (5, 10 … 60) and is addressed by that day.
 */

export const DAYS_PER_WEEK = 5;

/** The week an assessment belongs to: Day 5 → Week 1. */
export function assessmentWeek(day: number): number {
  return Math.ceil(day / DAYS_PER_WEEK);
}

/** The assessment after this day, if the day is a week's last one: Day 5 → 5, Day 4 → null. */
export function assessmentAfter(course: CourseOutlineResponse | undefined, day: number) {
  if (day % DAYS_PER_WEEK !== 0) return null;
  return course?.weeks.find((week) => week.number === assessmentWeek(day))?.assessment ?? null;
}

export type AssessmentScreen = "locked" | "not_ready" | "intro" | "questions" | "result";

/** Which screen the assessment shows for its status. */
export function assessmentScreen(view: Pick<AssessmentViewResponse, "status" | "attempt">): AssessmentScreen {
  switch (view.status) {
    case "locked":
      return "locked";
    case "not_ready":
      return "not_ready";
    case "ready":
      return "intro";
    case "in_progress":
      return view.attempt ? "questions" : "intro";
    default:
      return view.attempt?.result ? "result" : "intro";
  }
}

/** Choice questions needed to pass: 60% of 8 → 5. */
export function choiceNeeded(rules: Pick<AssessmentRules, "choiceQuestions" | "passPercent">): number {
  return Math.ceil((rules.choiceQuestions * rules.passPercent) / 100);
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** "1 day", "2 days", "12 hours". */
export function waitLabel(hours: number): string {
  if (hours % 24 === 0) return plural(hours / 24, "day");
  return plural(hours, "hour");
}

/** The "Before you start" rows, from the rules (markdown values). */
export function rulesRows(rules: AssessmentRules): { label: string; value: string }[] {
  const parts = [
    rules.choiceQuestions > 0 ? `${rules.choiceQuestions} multiple choice` : null,
    rules.writtenQuestions > 0
      ? `${rules.writtenQuestions} short written ${rules.writtenQuestions === 1 ? "answer" : "answers"}`
      : null,
  ].filter((part) => part !== null);
  const retake =
    rules.retakeHours === 0 ? "Retake straight away" : `Retake after ${waitLabel(rules.retakeHours)}`;
  const rows = [
    { label: "Questions", value: `${rules.questions}: ${parts.join(" and ")}` },
    {
      label: "To pass",
      value:
        `**${rules.passPercent}% of the multiple-choice questions** (${choiceNeeded(rules)} of ${rules.choiceQuestions}).` +
        (rules.writtenQuestions > 0 ? " Written answers don't count toward the pass mark." : ""),
    },
  ];
  if (rules.writtenQuestions > 0)
    rows.push({
      label: "Written answers",
      value: "Scored 1–5 by AI against a model answer. You'll see the score and the model answer.",
    });
  rows.push(
    {
      label: "Not passed?",
      value: `${retake}, with new questions. Your lessons stay open to revise.`,
    },
    {
      label: "Who sees it",
      value:
        "Your manager sees your score and can read your written answers. Your lessons, notes and daily quizzes stay private.",
    },
  );
  return rows;
}

const TIME = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const DATE = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });

/** "9:00 am" in the viewer's local time. */
function timeLabel(date: Date): string {
  return TIME.format(date)
    .replace(/\s?AM$/, " am")
    .replace(/\s?PM$/, " pm");
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * When the retake opens, in local time: "Retake opens today at 3:15 pm" / "tomorrow at 9:00 am" /
 * "on Mon 12 Oct at 9:00 am". Null when it's open now (no time, or the time has passed).
 */
export function retakeLabel(retakeAt: string | null, now: Date): string | null {
  if (!retakeAt) return null;
  const at = new Date(retakeAt);
  if (at.getTime() <= now.getTime()) return null;
  const days = Math.round((startOfDay(at) - startOfDay(now)) / 86_400_000);
  const when = days === 0 ? "today" : days === 1 ? "tomorrow" : `on ${DATE.format(at)}`;
  return `Retake opens ${when} at ${timeLabel(at)}`;
}

/** The outline row's hint: "10 q", "In progress", "Passed ✓", "Retake". */
export function outlineHint(status: AssessmentStatus, questions = 10): string {
  switch (status) {
    case "in_progress":
      return "In progress";
    case "passed":
      return "Passed ✓";
    case "failed":
      return "Retake";
    case "not_ready":
      return "Coming soon";
    case "locked":
      return "Locked";
    default:
      return `${questions} q`;
  }
}

/** Short status for Home and My plan. */
export const ASSESSMENT_STATUS_LABEL: Record<AssessmentStatus, string> = {
  locked: "Locked",
  not_ready: "Coming soon",
  ready: "Ready",
  in_progress: "In progress",
  passed: "Passed",
  failed: "Not passed",
};

/** The assessment can be opened from Home / My plan (locked ones open only during content review). */
export function assessmentOpen(assessment: { status: AssessmentStatus }, unlockAll: boolean): boolean {
  if (assessment.status === "not_ready") return false;
  return assessment.status !== "locked" || unlockAll;
}

/**
 * The assessment the menu's "Assessment" item opens: one that can be taken now (ready, in progress, to
 * retake), else the next locked one, else the last passed one. Null before any assessment exists.
 */
export function currentAssessmentDay(
  course: Pick<CourseOutlineResponse, "weeks"> | undefined,
): number | null {
  const list = (course?.weeks ?? []).flatMap((week) => (week.assessment ? [week.assessment] : []));
  const open = list.find((item) => ["ready", "in_progress", "failed"].includes(item.status));
  if (open) return open.day;
  const next = list.find((item) => item.status === "locked");
  if (next) return next.day;
  return list.filter((item) => item.status === "passed").at(-1)?.day ?? null;
}
