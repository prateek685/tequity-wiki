import { z } from "zod";
import { isoDateTime, personRef, RAG } from "./common.js";
import { cardId, PILLARS, type Pillar } from "./content.js";

/**
 * Phase gates (docs/PORTAL_PLAN.md §2, §3 "Gate pass bars"; PDF §5.3 and "Gate 1 — end of Week 4").
 * Gate 1 (after Day 20, M5) and Gate 2 (after Day 40, M6: 25-min healthcare scenario, recap + one written
 * follow-up, healthcare terms, the Phase 3 live-call plan).
 *
 * Format: 45 minutes with the manager. The manager picks a Phase 1 scenario (e.g. S12) with one surprise; the
 * engineer runs it live with the AI client for 20 minutes while the manager observes and scores the call
 * rubric (criteria 1–11, skip what didn't come up; #11 comes from the written recap). The engineer writes
 * the recap in the portal within 2 hours. Pass: average ≥ 2.5, no criterion at 1, recap within 2 hours.
 *
 * Below the bar the portal suggests "Repeat 2 focus blocks": the weeks that teach the gate's weakest
 * pillars. The manager confirms or changes them; those days reopen as round 2 (round 1 is kept), then the
 * gate is run again (gate round 2).
 */

export const GATES = [1, 2] as const;
export type GateNo = (typeof GATES)[number];
export const gateParam = z.object({
  gate: z.coerce
    .number()
    .int()
    .pipe(z.union([z.literal(1), z.literal(2)])),
});

/** The day each gate follows, and the day it unlocks. */
export const GATE_AFTER_DAY: Record<GateNo, number> = { 1: 20, 2: 40 };

/** Weeks a gate covers (5-day blocks): Gate 1 = Weeks 1–4. */
export const GATE_WEEKS: Record<GateNo, readonly number[]> = { 1: [1, 2, 3, 4], 2: [5, 6, 7, 8] };

/** Pass bars, word for word from the PDF. */
export const GATE_BARS = {
  1: { average: 2.5, minimum: 2, text: "Average ≥ 2.5, no criterion at 1, recap within 2 hours." },
  2: {
    average: 3.0,
    minimum: 2,
    text: "Average ≥ 3.0, no criterion below 2, basic healthcare terms used correctly.",
  },
} as const satisfies Record<GateNo, { average: number; minimum: number; text: string }>;

/** The recap counts as on time within this many minutes of the call (PDF: "within 2 hours"). */
export const RECAP_MINUTES = 120;

/** Gate 2's written follow-up: the recap plus one of these (PDF §5.3). */
export const FOLLOW_UP_TYPES = ["bad_news_email", "escalation", "weekly_status"] as const;
export type FollowUpType = (typeof FOLLOW_UP_TYPES)[number];
export const FOLLOW_UP_LABELS: Record<FollowUpType, string> = {
  bad_news_email: "Bad-news email",
  escalation: "Escalation message",
  weekly_status: "Weekly status report",
};

export const GATE_OUTCOMES = ["pass", "pass_focus", "repeat"] as const;
export type GateOutcome = (typeof GATE_OUTCOMES)[number];

/**
 * locked: Day 20 not done · to_book: Day 20 done, the engineer books the gate with their manager ·
 * recap_sent: the engineer submitted the recap, the manager hasn't recorded the result · passed ·
 * passed_focus · repeat: repeat blocks reopened, not all done again yet · rerun: repeat blocks done, the gate
 * runs again (round + 1).
 */
export const GATE_STATUSES = [
  "locked",
  "to_book",
  "recap_sent",
  "passed",
  "passed_focus",
  "repeat",
  "rerun",
] as const;
export type GateStatus = (typeof GATE_STATUSES)[number];

/** Criterion number "1"…"11" → 1–5, or null = didn't come up. */
export const gateCriteria = z.record(
  z.string().regex(/^(1[01]|[1-9])$/),
  z.number().int().min(1).max(5).nullable(),
);
export type GateCriteria = z.infer<typeof gateCriteria>;

// ── Pure rules (shared by the web form, live, and the API, which re-checks on save) ─────────────

export interface GateMaths {
  scored: number;
  /** Two decimals; null when nothing is scored. */
  average: number | null;
  lowest: number | null;
}

export function gateMaths(criteria: GateCriteria): GateMaths {
  const scores = Object.values(criteria).filter((score): score is number => score !== null);
  if (scores.length === 0) return { scored: 0, average: null, lowest: null };
  const average = Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 100) / 100;
  return { scored: scores.length, average, lowest: Math.min(...scores) };
}

/**
 * Meets the pass bar. Gate 1: average ≥ 2.5, nothing at 1, recap within 2 hours. Gate 2: average ≥ 3.0,
 * nothing below 2, basic healthcare terms used correctly (the PDF's Gate 2 bar has no recap-time rule).
 * Null when nothing is scored.
 */
export function meetsBar(
  gate: GateNo,
  criteria: GateCriteria,
  recapOnTime: boolean,
  healthcareTerms = false,
): boolean | null {
  const { average, lowest } = gateMaths(criteria);
  if (average === null || lowest === null) return null;
  const bar = GATE_BARS[gate];
  const extra = gate === 1 ? recapOnTime : healthcareTerms;
  return average >= bar.average && lowest >= bar.minimum && extra;
}

/** Gate average per pillar, via the approved rubric → pillar mapping (criterion number → pillar). */
export function gatePillarAverages(
  criteria: GateCriteria,
  criterionPillar: Record<number, Pillar>,
): Partial<Record<Pillar, number>> {
  const sums: Partial<Record<Pillar, { total: number; count: number }>> = {};
  for (const [key, score] of Object.entries(criteria)) {
    const pillar = criterionPillar[Number(key)];
    if (score === null || !pillar) continue;
    const entry = (sums[pillar] ??= { total: 0, count: 0 });
    entry.total += score;
    entry.count += 1;
  }
  const result: Partial<Record<Pillar, number>> = {};
  for (const pillar of PILLARS) {
    const entry = sums[pillar];
    if (entry) result[pillar] = entry.total / entry.count;
  }
  return result;
}

/**
 * The 2 weeks to repeat: each week is scored by the gate's pillar averages of the behaviours it targets
 * (its Friday scorecard list, e.g. Week 1 = C1, C4 → Communicate twice); the 2 lowest are suggested, earlier
 * week first on a tie. Weeks whose pillars weren't scored at the gate come last.
 */
export function suggestRepeatWeeks(
  pillarAverages: Partial<Record<Pillar, number>>,
  weekPillars: readonly { week: number; pillars: readonly Pillar[] }[],
): number[] {
  const scored = weekPillars.map(({ week, pillars }) => {
    const values = pillars
      .map((pillar) => pillarAverages[pillar])
      .filter((value): value is number => value !== undefined);
    return {
      week,
      score: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : Infinity,
    };
  });
  return scored
    .sort((a, b) => a.score - b.score || a.week - b.week)
    .slice(0, 2)
    .map(({ week }) => week)
    .sort((a, b) => a - b);
}

// ── Engineer ────────────────────────────────────────────────────────────────────────────────────

export const gateRecap = z.object({
  text: z.string(),
  submittedAt: isoDateTime,
  /** Gate 2: the second written piece and its type; null for Gate 1. */
  followUpType: z.enum(FOLLOW_UP_TYPES).nullable().default(null),
  followUpText: z.string().nullable().default(null),
});
export type GateRecap = z.infer<typeof gateRecap>;

/** A recorded gate result (one per gate round). */
export const gateResult = z.object({
  round: z.number().int().min(1),
  heldAt: isoDateTime,
  scored: z.number().int(),
  average: z.number().nullable(),
  lowest: z.number().int().nullable(),
  criteria: gateCriteria,
  recapOnTime: z.boolean(),
  outcome: z.enum(GATE_OUTCOMES),
  /** pass_focus: 1–2 focus items for the next weeks' mocks. */
  focusItems: z.array(z.string()),
  /** repeat: the weeks reopened as the next round. */
  repeatWeeks: z.array(z.number().int()),
  rag: z.enum(RAG),
  note: z.string(),
  by: personRef,
  /** Gate 2: basic healthcare terms used correctly; null for Gate 1. */
  healthcareTerms: z.boolean().nullable().default(null),
  /** Gate 2: the Phase 3 live-call plan (which real calls to shadow, co-lead, lead); null for Gate 1. */
  liveCallPlan: z.string().nullable().default(null),
});
export type GateResult = z.infer<typeof gateResult>;

/** GET /api/me/gates/:gate — the engineer's Gate page. */
export const gateViewResponse = z.object({
  gate: z.number().int(),
  status: z.enum(GATE_STATUSES),
  /** The current round (1, then 2 after a repeat). */
  round: z.number().int().min(1),
  afterDay: z.number().int(),
  /** When the gate's day (20 or 40) was finished, null before. */
  reachedAt: isoDateTime.nullable(),
  /** The current round's recap, null before it's written. */
  recap: gateRecap.nullable(),
  /** The current round's result, null until the manager records it. */
  result: gateResult.nullable(),
  /** Earlier rounds, newest first. */
  history: z.array(gateResult),
  /** The repeat days, while status is repeat: [{ day, done }]. */
  repeatDays: z.array(z.object({ day: z.number().int(), done: z.boolean() })),
  unlockAll: z.boolean(),
});
export type GateViewResponse = z.infer<typeof gateViewResponse>;

/** PUT /api/me/gates/:gate/recap — write or edit the recap until the result is recorded. `submittedAt` stays the first submit. */
export const saveGateRecapRequest = z.object({
  text: z.string().trim().min(20, "Write the full recap.").max(5000),
  /** Gate 2 only, both required there (VALIDATION otherwise). */
  followUpType: z.enum(FOLLOW_UP_TYPES).optional(),
  followUpText: z.string().trim().max(5000).optional(),
});
export type SaveGateRecapRequest = z.infer<typeof saveGateRecapRequest>;

/** A gate in the course outline / My plan. */
export const gateSummary = z.object({
  gate: z.number().int(),
  afterDay: z.number().int(),
  status: z.enum(GATE_STATUSES),
});
export type GateSummary = z.infer<typeof gateSummary>;

// ── Manager ─────────────────────────────────────────────────────────────────────────────────────

/** GET /api/manager/gates — gates to book, record or re-run for the manager's engineers. */
export const gateListResponse = z.object({
  gates: z.array(
    z.object({
      engineer: personRef,
      gate: z.number().int(),
      round: z.number().int(),
      status: z.enum(GATE_STATUSES),
      reachedAt: isoDateTime.nullable(),
      recapAt: isoDateTime.nullable(),
      result: gateResult.pick({ outcome: true, average: true, heldAt: true }).nullable(),
    }),
  ),
});
export type GateListResponse = z.infer<typeof gateListResponse>;

export const managerGateParam = z.object({
  id: z.uuid(),
  gate: z.coerce
    .number()
    .int()
    .pipe(z.union([z.literal(1), z.literal(2)])),
});

/** GET /api/manager/engineers/:id/gates/:gate — the gate form. */
export const gateFormResponse = z.object({
  engineer: personRef,
  gate: z.number().int(),
  round: z.number().int(),
  status: z.enum(GATE_STATUSES),
  /** False until the gate's day (20 or 40) is done (the form can't be saved). */
  reached: z.boolean(),
  recap: gateRecap.nullable(),
  /** Cards the manager can pick the scenario from: Gate 1 = Phase 1 cards (the PDF suggests S12 with a
   * surprise); Gate 2 = Phase 2 healthcare cards. */
  cards: z.array(z.object({ id: cardId, title: z.string(), client: z.string() })),
  /** Each covered week and the pillars its scorecard targets (one entry per behaviour), for suggestRepeatWeeks. */
  weeks: z.array(
    z.object({
      week: z.number().int(),
      title: z.string(),
      firstDay: z.number().int(),
      pillars: z.array(z.enum(PILLARS)),
    }),
  ),
  /** The saved scenario and result of this round, null before. */
  saved: z.object({ cardId: cardId.nullable(), surprise: z.string(), result: gateResult }).nullable(),
  history: z.array(gateResult),
});
export type GateFormResponse = z.infer<typeof gateFormResponse>;

/**
 * PUT /api/manager/engineers/:id/gates/:gate — record the current round. The API re-checks the maths;
 * `overrideNote` is required when the outcome goes against the pass bar (pass below the bar, or repeat at
 * or above it); `repeatWeeks` (2 of the gate's weeks) only with repeat; 1–2 `focusItems` only with pass_focus.
 * Effects: pass / pass_focus → Day 21 opens · repeat → those weeks' days reopen as the next round.
 */
export const saveGateRequest = z.object({
  heldAt: isoDateTime,
  cardId: cardId.nullable(),
  /** The surprise the manager added (kept with the result; the engineer sees it after recording). */
  surprise: z.string().trim().max(500).default(""),
  criteria: gateCriteria,
  recapOnTime: z.boolean(),
  outcome: z.enum(GATE_OUTCOMES),
  focusItems: z.array(z.string().trim().min(1).max(200)).max(2).default([]),
  repeatWeeks: z.array(z.number().int().min(1).max(13)).max(2).default([]),
  rag: z.enum(RAG),
  note: z.string().trim().min(1, "Add a one-line note.").max(300),
  overrideNote: z.string().trim().max(500).default(""),
  /** Gate 2 only: basic healthcare terms used correctly. */
  healthcareTerms: z.boolean().default(false),
  /** Gate 2 only, required there: the Phase 3 live-call plan. */
  liveCallPlan: z.string().trim().max(1000).default(""),
});
export type SaveGateRequest = z.infer<typeof saveGateRequest>;
