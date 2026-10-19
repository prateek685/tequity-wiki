import {
  type BehaviourRatings,
  type Block,
  type LockReason,
  type Pace,
  type PlanDay,
  type QuizStatus,
  type ReadinessModel,
  type TaskSource,
} from "@portal/contracts";
import { formatDate } from "@/lib/dates";

/**
 * Plain-language rules for showing the plan (docs/PORTAL_PLAN.md §1, §2). Pure: unit-tested.
 * Days are numbered 1–65; the PDF's weeks are shown as 5-day blocks ("Days 1–5"), never as weeks.
 */

export const LAST_DAY = 65;
const BLOCK_SIZE = 5;

/** Phase 1 = Days 1–20, Phase 2 = 21–40, Phase 3 = 41–65. */
export function phaseOf(day: number): 1 | 2 | 3 {
  if (day <= 20) return 1;
  if (day <= 40) return 2;
  return 3;
}

/** The plan's phases (content/plan.yaml: fixed reference data, same for every engineer). */
export const PHASES = [
  { phase: 1, name: "Foundation", first: 1, last: 20 },
  { phase: 2, name: "Client craft", first: 21, last: 40 },
  { phase: 3, name: "Live reps", first: 41, last: 65 },
] as const;

/** "Phase 1 · Foundation". */
export function phaseLabel(day: number): string {
  const phase = PHASES[phaseOf(day) - 1];
  return phase ? `Phase ${phase.phase} · ${phase.name}` : `Phase ${phaseOf(day)}`;
}

/** "Good morning" / "Good afternoon" / "Good evening" by the viewer's local time. */
export function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const PLAN_LENGTH_DAYS = 90;
const DAY_MS = 86_400_000;

/** Pause days: how far the target date has moved past start + 90 days. */
export function pauseDays(startDate: string, targetDate: string): number {
  const days = (Date.parse(`${targetDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / DAY_MS;
  return Math.max(0, Math.round(days) - PLAN_LENGTH_DAYS);
}

/** The days of a 5-day block: block 1 → Days 1–5. */
export function blockDays(blockNumber: number): { first: number; last: number } {
  const first = (blockNumber - 1) * BLOCK_SIZE + 1;
  return { first, last: first + BLOCK_SIZE - 1 };
}

export function blockLabel(blockNumber: number): string {
  const { first, last } = blockDays(blockNumber);
  return `Days ${first}–${last}`;
}

/** "Days 1–5 · Baseline and structured speaking". */
export function blockLine(block: Pick<Block, "number" | "title">): string {
  return `${blockLabel(block.number)} · ${block.title}`;
}

export interface Checkpoint {
  kind: "assessment" | "checkin" | "gate" | "final";
  title: string;
  detail: string;
}

const CHECK_IN_DAYS = [10, 30, 50, 60];
/** The assessment's pass mark as engineers read it (docs/PORTAL_PLAN.md §2). */
const ASSESSMENT_RULE = "60% on multiple choice to continue";

/**
 * Checkpoints after a day, in order: assessment + scorecard (every 5th day), manager check-in, gate. With
 * the enrollment, a check-in's detail says when it's expected.
 */
export function checkpointsAfter(day: number, enrollment?: PlanDates, today?: string): Checkpoint[] {
  const checkpoints: Checkpoint[] = [];
  if (day % BLOCK_SIZE === 0 && day < LAST_DAY)
    checkpoints.push({
      kind: "assessment",
      title: `Assessment · ${blockLabel(day / BLOCK_SIZE)} + scorecard`,
      detail: ASSESSMENT_RULE,
    });
  if (CHECK_IN_DAYS.includes(day))
    checkpoints.push({
      kind: "checkin",
      title: "Check-in with your manager",
      detail: checkInDetail(day, enrollment, today),
    });
  if (day === 20 || day === 40)
    checkpoints.push({
      kind: "gate",
      title: `Gate ${day / 20}`,
      detail: `Book a 45-minute live call with your manager · Day ${day + 1} opens after a pass`,
    });
  if (day === LAST_DAY - 1)
    checkpoints.push({
      kind: "final",
      title: "Final review",
      detail: "Book it with your manager · they or your PM observe a real client call you lead",
    });
  return checkpoints;
}

type PlanDates = { startDate: string; targetDate: string } | null | undefined;

/**
 * When the engineer is expected to reach a day at their target pace: start date + day × (plan length ÷ 65),
 * as YYYY-MM-DD.
 */
export function expectedDate(day: number, enrollment: { startDate: string; targetDate: string }): string {
  const start = Date.parse(`${enrollment.startDate}T00:00:00Z`);
  const length = (Date.parse(`${enrollment.targetDate}T00:00:00Z`) - start) / 86_400_000;
  const offset = Math.round((day * length) / LAST_DAY);
  return new Date(start + offset * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The engineer books each check-in with their manager (PDF §4 "Setup", step 5). Adds the expected date
 * while it's still ahead, e.g. "Book it with your manager · around 14 Nov 2026".
 */
export function checkInDetail(
  day: number,
  enrollment?: PlanDates,
  today = new Date().toISOString().slice(0, 10),
) {
  const book = "Book it with your manager";
  if (!enrollment) return book;
  const date = expectedDate(day, enrollment);
  return date >= today ? `${book} · around ${formatDate(date)}` : book;
}

/** The next manager check-in on or after a day, if any is left. */
export function nextCheckInDay(day: number): number | null {
  return CHECK_IN_DAYS.find((checkIn) => checkIn >= day) ?? null;
}

/** Why a day can't be opened yet, as one sentence. */
export function lockMessage(reason: LockReason | null, day: number, startDate?: string): string {
  const previous = day - 1;
  switch (reason) {
    case "start_date":
      return startDate
        ? `Day 1 opens on your start date, ${formatDate(startDate)}.`
        : "Day 1 opens on your start date.";
    case "previous_day":
      return `Finish Day ${previous} to open this day.`;
    case "assessment":
      return `Pass the assessment after Day ${previous} to open this day.`;
    case "scorecard":
      return `Submit your scorecard for ${blockLabel(Math.ceil(previous / BLOCK_SIZE))} to open this day.`;
    case "gate":
      return `Pass Gate ${previous <= 20 ? 1 : 2} to open this day.`;
    default:
      return "This day isn't open yet.";
  }
}

export const NOT_READY_MESSAGE = "This lesson isn't available yet.";

/** The pace note: "On pace", "3 days behind", "2 days ahead". */
export function paceLabel(pace: Pace): string {
  const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;
  switch (pace.status) {
    case "not_started":
      return "Not started yet";
    case "behind":
      return `${days(pace.difference)} behind`;
    case "ahead":
      return `${days(-pace.difference)} ahead`;
    default:
      return "On pace";
  }
}

export function daysDone(days: PlanDay[]): number {
  return days.filter((day) => day.status === "done").length;
}

/** What the daily quiz card says for each status. */
export const QUIZ_MESSAGES: Record<QuizStatus, string> = {
  locked: "Finish today's lessons first. The daily quiz comes last.",
  ready: "5 questions on today's lesson. There is no pass mark.",
  in_progress: "You've started this quiz. Pick up where you left off.",
  done: "You've finished today's quiz.",
  not_ready: "Today's quiz isn't available yet.",
  none: "This day has no daily quiz.",
};

const CAREBOOK_REMINDER = "Practice only: use CareBook details. No real client or patient data.";
const REAL_PROJECT_REMINDER =
  "Real project is fine: anonymise names, no patient data, credentials or confidential documents.";

/** The safety reminder shown above a written task, by where the task is done. */
export function safetyReminders(source: TaskSource): string[] {
  if (source === "carebook") return [CAREBOOK_REMINDER];
  if (source === "real_project") return [REAL_PROJECT_REMINDER];
  return [REAL_PROJECT_REMINDER, CAREBOOK_REMINDER];
}

/** The mock log scores rubric criteria 1–10 (11, the written follow-up, is scored elsewhere). */
export function mockRubric(model: Pick<ReadinessModel, "rubric">): ReadinessModel["rubric"] {
  return model.rubric.filter((criterion) => criterion.number <= 10);
}

export interface PillarAverage {
  id: ReadinessModel["pillars"][number]["id"];
  name: string;
  /** Mean of the pillar's rated behaviours, one decimal; null when none is rated. */
  average: number | null;
}

/** The baseline's average per pillar, in the model's pillar order. */
export function pillarAverages(
  model: Pick<ReadinessModel, "pillars" | "behaviours">,
  ratings: Partial<BehaviourRatings>,
): PillarAverage[] {
  return model.pillars.map((pillar) => {
    const scores = model.behaviours
      .filter((behaviour) => behaviour.pillar === pillar.id)
      .flatMap((behaviour) => {
        const score = ratings[behaviour.id];
        return score === undefined ? [] : [score];
      });
    const average =
      scores.length === 0
        ? null
        : Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10;
    return { id: pillar.id, name: pillar.name, average };
  });
}
