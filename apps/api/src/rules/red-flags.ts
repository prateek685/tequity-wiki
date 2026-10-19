import {
  AVOIDING_LIVE_COUNT,
  GATE_AFTER_DAY,
  type GateNo,
  type GateOutcome,
  type Pillar,
  PILLARS,
  type PillarScores,
  type RedFlagKind,
} from "@portal/contracts";
import { DAYS_PER_WEEK } from "./scorecard.js";
import { dateFromIso, isoFromDate } from "../common/dates.js";

/**
 * Red flags (PDF §5.4, followed exactly; docs/PORTAL_PLAN.md §3 "Red flags"; how each signal is measured:
 * packages/contracts/src/red-flags.ts). Pure: the worker loads one engineer's numbers, these rules say
 * which signals are on now, and app.red_flags_sync() raises the new ones and clears the ones that went
 * away. Pause days are excluded.
 */

/** A signal that is on now. `key` tells flags of the same kind apart (a pillar, a gate round …). */
export interface RedFlagSignal {
  kind: RedFlagKind;
  key: string;
  /** The specifics shown with the PDF's text, e.g. "Stand firm: 2, 2, 1 (Weeks 3–5)". */
  detail: string;
}

/** A signal the rules can't judge this time (e.g. a period overlapping a pause): its flag is left as it is. */
export interface RedFlagHold {
  kind: RedFlagKind;
  key: string;
}

export interface RedFlagEvaluation {
  signals: RedFlagSignal[];
  hold: RedFlagHold[];
}

export interface RedFlagGateResult {
  gate: GateNo;
  round: number;
  outcome: GateOutcome;
  /** The gate's average per pillar (rubric → pillar mapping); pillars not scored are left out. */
  pillarAverages: Partial<Record<Pillar, number>>;
}

export interface RedFlagInput {
  /** YYYY-MM-DD in the plan's calendar. */
  today: string;
  startDate: string;
  pauses: readonly { from: string; to: string }[];
  /** When Day 5 was first completed (YYYY-MM-DD), null before. */
  day5DoneOn: string | null;
  /** The newest Friday scorecard (any week or round): when it was submitted and its week. */
  lastScorecard: { on: string; week: number } | null;
  /** The scorecard chart in week order: per week, every pillar's score, rated that week or carried forward. */
  scorecards: readonly { week: number; scores: PillarScores }[];
  /** Every recorded gate result (all gates and rounds). */
  gates: readonly RedFlagGateResult[];
  /** Days (YYYY-MM-DD) with any lesson saved, quiz or assessment question answered. */
  practiceDays: ReadonlySet<string>;
  /** Phase 3 live-call days deferred ("later" at some point) or replaced by the substitute mock, in day order. */
  liveAvoided: readonly { day: number; how: "deferred" | "substitute" }[];
  pillarNames: Readonly<Record<Pillar, string>>;
}

/** No new scorecard for this many days (pause days not counted): "missing 2 weeks in a row". */
export const SCORECARD_MISSING_DAYS = 14;
/** The same pillar at this or below … */
export const PILLAR_LOW_MAX = 2;
/** … on this many scorecards in a row. */
export const PILLAR_LOW_RUN = 3;
/** Self-score vs gate score difference that raises a flag. */
export const SELF_VS_GATE_GAP = 2;
/** Fewer than this many practice days … */
export const PRACTICE_DAYS_MIN = 3;
/** … in each of this many 7-day periods. */
export const PRACTICE_PERIODS = 2;
const PERIOD_DAYS = 7;

export function addDays(iso: string, days: number): string {
  return isoFromDate(new Date(dateFromIso(iso).getTime() + days * 86_400_000));
}

function isPaused(day: string, pauses: RedFlagInput["pauses"]): boolean {
  return pauses.some((pause) => pause.from <= day && day <= pause.to);
}

function overlapsPause(from: string, to: string, pauses: RedFlagInput["pauses"]): boolean {
  return pauses.some((pause) => pause.from <= to && pause.to >= from);
}

/** Days after `from` up to and including `to` that aren't pause days. */
export function unpausedDaysSince(from: string, to: string, pauses: RedFlagInput["pauses"]): number {
  let count = 0;
  for (let day = addDays(from, 1); day <= to; day = addDays(day, 1)) {
    if (!isPaused(day, pauses)) count++;
  }
  return count;
}

const formatScore = (value: number) => String(Math.round(value * 10) / 10);

/**
 * scorecard_missing: past Day 5 (and not finished: the caller skips finished engineers), and no new
 * scorecard for 14 days, pause days not counted. Counted from the newest scorecard (else Day 5).
 */
export function scorecardMissing(input: RedFlagInput): RedFlagSignal[] {
  if (!input.day5DoneOn) return [];
  const since = input.lastScorecard?.on ?? input.day5DoneOn;
  const days = unpausedDaysSince(since, input.today, input.pauses);
  if (days < SCORECARD_MISSING_DAYS) return [];
  const last = input.lastScorecard ? ` (last: Week ${input.lastScorecard.week})` : "";
  return [{ kind: "scorecard_missing", key: "", detail: `No new scorecard for ${days} days${last}` }];
}

/** pillar_low: a pillar at 2 or below on each of the last 3 scorecards (rated or carried forward). */
export function pillarLow(input: RedFlagInput): RedFlagSignal[] {
  const cards = [...input.scorecards].sort((a, b) => a.week - b.week).slice(-PILLAR_LOW_RUN);
  if (cards.length < PILLAR_LOW_RUN) return [];
  return PILLARS.flatMap((pillar): RedFlagSignal[] => {
    const scores = cards.map((card) => card.scores[pillar]);
    if (!scores.every((score) => score !== null && score <= PILLAR_LOW_MAX)) return [];
    const first = cards[0]?.week;
    const last = cards.at(-1)?.week;
    return [
      {
        kind: "pillar_low",
        key: pillar,
        detail: `${input.pillarNames[pillar]}: ${scores.map((s) => formatScore(s ?? 0)).join(", ")} (Weeks ${first}–${last})`,
      },
    ];
  });
}

/**
 * self_vs_gate: the latest round of each gate, per pillar: the gate's average vs that week's scorecard
 * score (Gate 1 → Week 4, Gate 2 → Week 8; rated or carried forward) differ by 2 or more.
 */
export function selfVsGate(input: RedFlagInput): RedFlagSignal[] {
  const latest = new Map<GateNo, RedFlagGateResult>();
  for (const result of input.gates) {
    const seen = latest.get(result.gate);
    if (!seen || result.round > seen.round) latest.set(result.gate, result);
  }
  return [...latest.values()]
    .sort((a, b) => a.gate - b.gate)
    .flatMap((result): RedFlagSignal[] => {
      const week = GATE_AFTER_DAY[result.gate] / DAYS_PER_WEEK;
      const card = input.scorecards.find((row) => row.week === week);
      if (!card) return [];
      const gaps = PILLARS.flatMap((pillar) => {
        const self = card.scores[pillar];
        const gate = result.pillarAverages[pillar];
        if (self === null || gate === undefined || Math.abs(self - gate) < SELF_VS_GATE_GAP) return [];
        return [`${input.pillarNames[pillar]} self ${formatScore(self)} vs gate ${formatScore(gate)}`];
      });
      if (gaps.length === 0) return [];
      return [
        {
          kind: "self_vs_gate",
          key: `gate${result.gate}-round${result.round}`,
          detail: `Gate ${result.gate}: ${gaps.join("; ")}`,
        },
      ];
    });
}

export interface PracticePeriods {
  /** The last 2 seven-day periods before today, newest first, each with its practice-day count. */
  periods: { from: string; to: string; days: number }[];
  /** A period starts before the start date (nothing to judge yet). */
  tooEarly: boolean;
  /** A period overlaps a pause (not counted: the flag is held as it is). */
  paused: boolean;
}

/** The last 2 full seven-day periods, ending yesterday (today isn't over yet). */
export function practicePeriods(input: RedFlagInput): PracticePeriods {
  const periods = Array.from({ length: PRACTICE_PERIODS }, (_, index) => {
    const to = addDays(input.today, -1 - index * PERIOD_DAYS);
    const from = addDays(to, -(PERIOD_DAYS - 1));
    let days = 0;
    for (let day = from; day <= to; day = addDays(day, 1)) if (input.practiceDays.has(day)) days++;
    return { from, to, days };
  });
  return {
    periods,
    tooEarly: periods.some((period) => period.from < input.startDate),
    paused: periods.some((period) => overlapsPause(period.from, period.to, input.pauses)),
  };
}

/** few_practice_days: fewer than 3 practice days in each of the last 2 seven-day periods. */
export function fewPracticeDays(input: RedFlagInput): RedFlagEvaluation {
  const { periods, tooEarly, paused } = practicePeriods(input);
  if (tooEarly) return { signals: [], hold: [] };
  if (paused) return { signals: [], hold: [{ kind: "few_practice_days", key: "" }] };
  if (!periods.every((period) => period.days < PRACTICE_DAYS_MIN)) return { signals: [], hold: [] };
  const counts = [...periods].reverse().map((period) => period.days);
  return {
    signals: [
      {
        kind: "few_practice_days",
        key: "",
        detail: `Practice days in the last two weeks: ${counts.join(" and ")}`,
      },
    ],
    hold: [],
  };
}

/** gate_not_passed: each gate round recorded with outcome "repeat". */
export function gateNotPassed(input: RedFlagInput): RedFlagSignal[] {
  return input.gates
    .filter((result) => result.outcome === "repeat")
    .sort((a, b) => a.gate - b.gate || a.round - b.round)
    .map((result) => ({
      kind: "gate_not_passed" as const,
      key: `gate${result.gate}-round${result.round}`,
      detail: `Gate ${result.gate}, round ${result.round}`,
    }));
}

/** avoiding_live: 2 or more live-call days deferred or replaced by a substitute (once raised, one flag). */
export function avoidingLive(input: RedFlagInput): RedFlagSignal[] {
  if (input.liveAvoided.length < AVOIDING_LIVE_COUNT) return [];
  const days = input.liveAvoided.map(
    (row) => `Day ${row.day} (${row.how === "deferred" ? "later" : "substitute"})`,
  );
  return [{ kind: "avoiding_live", key: "phase3", detail: days.join(", ") }];
}

/** Every signal that is on now for one engineer (active enrollment, Day 65 not done). */
export function redFlagSignals(input: RedFlagInput): RedFlagEvaluation {
  const practice = fewPracticeDays(input);
  return {
    signals: [
      ...scorecardMissing(input),
      ...pillarLow(input),
      ...selfVsGate(input),
      ...practice.signals,
      ...gateNotPassed(input),
      ...avoidingLive(input),
    ],
    hold: practice.hold,
  };
}
