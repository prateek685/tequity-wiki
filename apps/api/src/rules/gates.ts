import {
  GATE_WEEKS,
  type GateCriteria,
  type GateNo,
  type GateOutcome,
  type GateStatus,
  type Pillar,
} from "@portal/contracts";
import { hasAssessmentAfter } from "./day-status.js";
import { daysOfWeek } from "./rounds.js";
import { DAYS_PER_WEEK } from "./scorecard.js";
import { daysBetween } from "../common/dates.js";

/**
 * Phase gates (docs/PORTAL_PLAN.md §2, §3; packages/contracts/src/gates.ts). Pure. The gate maths
 * (`gateMaths`, `meetsBar`) come from the contracts, shared with the web form.
 */

/** Criteria 1–11 of the call rubric. */
export const GATE_CRITERIA = 11;

/** A gate's tasks on the manager's Team page are due for this many days after it's reached, then overdue. */
export const GATE_DUE_DAYS = 7;

export interface GateRoundResult {
  round: number;
  outcome: GateOutcome;
}

export interface GateStateInput {
  /** The gate's day (Day 20 for Gate 1) has been completed (in any round). */
  reached: boolean;
  /** The recorded result of the highest gate round, or null. */
  latest: GateRoundResult | null;
  /** Gate rounds that have a recap. */
  recapRounds: ReadonlySet<number>;
  /** Only when `latest` is a repeat: every reopened day is done again (and its assessment passed). */
  repeatComplete: boolean;
}

export interface GateState {
  status: GateStatus;
  /**
   * The gate round the screens show and a save records: the next round while booking (to_book,
   * recap_sent, rerun), else the latest result's round (passed, passed_focus, repeat: editable while
   * the next step hasn't started).
   */
  round: number;
}

export function gateState(input: GateStateInput): GateState {
  if (!input.reached) return { status: "locked", round: 1 };
  const latest = input.latest;
  if (!latest) return { status: input.recapRounds.has(1) ? "recap_sent" : "to_book", round: 1 };
  if (latest.outcome === "pass") return { status: "passed", round: latest.round };
  if (latest.outcome === "pass_focus") return { status: "passed_focus", round: latest.round };
  if (!input.repeatComplete) return { status: "repeat", round: latest.round };
  const next = latest.round + 1;
  return { status: input.recapRounds.has(next) ? "recap_sent" : "rerun", round: next };
}

export function isGatePassed(status: GateStatus): boolean {
  return status === "passed" || status === "passed_focus";
}

/** The engineer can write the recap of `round` (no result recorded for it yet). */
export function isRecapOpen(status: GateStatus): boolean {
  return status === "to_book" || status === "recap_sent" || status === "rerun";
}

/**
 * The outcome goes against the pass bar, so the manager must say why: a pass (with or without focus
 * items) when the bar isn't met (or nothing was scored), or a repeat when it is met.
 */
export function overrideNoteRequired(outcome: GateOutcome, meetsBar: boolean | null): boolean {
  return outcome === "repeat" ? meetsBar === true : meetsBar !== true;
}

/** A repeat names exactly 2 different weeks of the gate (Gate 1: Weeks 1–4). */
export function repeatWeeksValid(gate: GateNo, weeks: readonly number[]): boolean {
  const allowed = GATE_WEEKS[gate];
  return weeks.length === 2 && weeks[0] !== weeks[1] && weeks.every((week) => allowed.includes(week));
}

/** Criteria 1–11 as stored: every criterion, null when it didn't come up (or wasn't sent). */
export function fullCriteria(criteria: GateCriteria): Record<number, number | null> {
  return Object.fromEntries(
    Array.from({ length: GATE_CRITERIA }, (_, i) => [i + 1, criteria[String(i + 1)] ?? null]),
  );
}

/** One pillar per behaviour of a week's Friday scorecard list (Week 1 = C1, C4 → communicate twice). */
export function weekPillars(
  behaviourIds: readonly string[],
  behaviours: readonly { id: string; pillar: Pillar }[],
): Pillar[] {
  return behaviourIds.flatMap((id) => {
    const pillar = behaviours.find((behaviour) => behaviour.id === id)?.pillar;
    return pillar ? [pillar] : [];
  });
}

export interface RepeatProgress {
  days: { day: number; done: boolean }[];
  /** Every day done in the new round, and each week's assessment passed in it. */
  complete: boolean;
}

/** Progress through the reopened weeks (`doneDays` and `assessmentsPassed` of the current round). */
export function repeatProgress(
  weeks: readonly number[],
  doneDays: ReadonlySet<number>,
  assessmentsPassed: ReadonlySet<number>,
): RepeatProgress {
  const sorted = [...weeks].sort((a, b) => a - b);
  const days = sorted.flatMap(daysOfWeek).map((day) => ({ day, done: doneDays.has(day) }));
  const assessments = sorted.map((week) => week * DAYS_PER_WEEK).filter(hasAssessmentAfter);
  return {
    days,
    complete: days.every((d) => d.done) && assessments.every((day) => assessmentsPassed.has(day)),
  };
}

export interface GateDue {
  status: "due" | "overdue";
  /** due: days left (0 = today) · overdue: days past the window. */
  days: number;
}

/** A gate to book is due for 7 days after it's reached (YYYY-MM-DD in the plan's calendar), then overdue. */
export function gateDue(reachedOn: string, today: string): GateDue {
  const since = Math.max(0, daysBetween(reachedOn, today));
  return since <= GATE_DUE_DAYS
    ? { status: "due", days: GATE_DUE_DAYS - since }
    : { status: "overdue", days: since - GATE_DUE_DAYS };
}
