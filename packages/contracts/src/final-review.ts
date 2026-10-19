import { z } from "zod";
import { isoDateTime, personRef, RAG } from "./common.js";
import { LIVE_ROLES } from "./content.js";
import { type GateCriteria, gateCriteria, gateMaths } from "./gates.js";

/**
 * Phase 3: live-call days, the readiness case and the final review (docs/PORTAL_PLAN.md §2, §3; PDF §5.3
 * "Final review", Week 13, A11).
 *
 * Live-call days (43, 45, 48, 50, 53, 55, 58, 60, 62): the engineer picks what happened. "Later" lets the
 * next day open, but every live call must be done before the final review is recorded. 2 or more deferrals
 * ("later", even if done afterwards) or substitutes raise the red flag `avoiding_live`.
 *
 * Readiness case (Days 63–64, A11): drafted on Day 63, shared with the manager when Day 64's lesson is saved.
 * Final review (Day 65): the manager or PM observes a real client call the engineer leads (usually the Day 62
 * solo call) and scores the call rubric (criteria 1–11); the 45-minute review also covers the solo week's
 * written follow-ups, PM or senior feedback and the readiness case. The engineer books it.
 */

export const LIVE_PATHS = ["had_call", "shadowed_other", "later", "substitute"] as const;
export type LivePath = (typeof LIVE_PATHS)[number];
export const LIVE_PATH_LABELS: Record<LivePath, string> = {
  had_call: "I had the live call",
  shadowed_other: "I joined another team's call",
  later: "It's scheduled for later",
  substitute: "No live call: I did the substitute mock",
};

/** Deferrals plus substitutes that raise the red flag "Avoiding shadowing or co-lead opportunities". */
export const AVOIDING_LIVE_COUNT = 2;

/** One live-call day as the manager sees it (no notes: the call sheet stays private). */
export const liveCallRow = z.object({
  day: z.number().int(),
  role: z.enum(LIVE_ROLES),
  /** Null until the engineer saves the day's live lesson. */
  path: z.enum(LIVE_PATHS).nullable(),
  /** "Later" was chosen at some point. */
  deferred: z.boolean(),
  updatedAt: isoDateTime.nullable(),
});
export type LiveCallRow = z.infer<typeof liveCallRow>;

// ── Final review ────────────────────────────────────────────────────────────────────────────────

export const FINAL_OUTCOMES = ["client_ready", "light_support", "another_cycle"] as const;
export type FinalOutcome = (typeof FINAL_OUTCOMES)[number];

/** PDF §5.3, word for word: the decision and what happens next. */
export const FINAL_OUTCOME_TEXT: Record<FinalOutcome, { label: string; bar: string; next: string }> = {
  client_ready: {
    label: "Client-ready",
    bar: "Average ≥ 3.5, nothing below 3.",
    next: "Can be deployed on a client project without a PM.",
  },
  light_support: {
    label: "Ready with light support",
    bar: "Average ≥ 3.0.",
    next: "Deployed, with a weekly PM check-in for the first 30 days.",
  },
  another_cycle: {
    label: "Another cycle",
    bar: "Below 3.0.",
    next: "A targeted 30-day plan on the two weakest pillars, then a re-review.",
  },
};

/** The decision the scores point to, checked in order; null when nothing is scored. */
export function finalOutcome(criteria: GateCriteria): FinalOutcome | null {
  const { average, lowest } = gateMaths(criteria);
  if (average === null || lowest === null) return null;
  if (average >= 3.5 && lowest >= 3) return "client_ready";
  if (average >= 3.0) return "light_support";
  return "another_cycle";
}

/**
 * locked: Day 64 not done (the readiness case isn't shared yet) · to_book: the engineer books the review
 * with their manager · recorded.
 */
export const FINAL_STATUSES = ["locked", "to_book", "recorded"] as const;
export type FinalStatus = (typeof FINAL_STATUSES)[number];

export const OBSERVERS = ["manager", "pm"] as const;

export const finalReviewResult = z.object({
  heldAt: isoDateTime,
  /** Who observed the real client call. */
  observer: z.enum(OBSERVERS),
  /** The observed call, e.g. "Day 62 solo call: CareBook weekly sync". */
  call: z.string(),
  scored: z.number().int(),
  average: z.number().nullable(),
  lowest: z.number().int().nullable(),
  criteria: gateCriteria,
  outcome: z.enum(FINAL_OUTCOMES),
  rag: z.enum(RAG),
  note: z.string(),
  by: personRef,
});
export type FinalReviewResult = z.infer<typeof finalReviewResult>;

/** The readiness case as shared (A11 fields in order, with their labels). */
export const readinessCase = z.object({
  fields: z.array(z.object({ id: z.string(), label: z.string(), value: z.string() })),
  submittedAt: isoDateTime,
});
export type ReadinessCase = z.infer<typeof readinessCase>;

/** In My plan and the course outline. */
export const finalReviewSummary = z.object({ status: z.enum(FINAL_STATUSES) });
export type FinalReviewSummary = z.infer<typeof finalReviewSummary>;

/** GET /api/me/final-review — the engineer's Final review page. */
export const finalReviewViewResponse = z.object({
  status: z.enum(FINAL_STATUSES),
  /** When Day 64 was done (the readiness case shared), null before. */
  reachedAt: isoDateTime.nullable(),
  /** Live-call days still "later": they must be done before the review is recorded. */
  pendingLive: z.array(z.number().int()),
  result: finalReviewResult.nullable(),
  unlockAll: z.boolean(),
});
export type FinalReviewViewResponse = z.infer<typeof finalReviewViewResponse>;

// ── Manager ─────────────────────────────────────────────────────────────────────────────────────

/** GET /api/manager/engineers/:id/final-review — the final review form. */
export const finalReviewFormResponse = z.object({
  engineer: personRef,
  status: z.enum(FINAL_STATUSES),
  /** False until Day 64 is done (the form can't be saved). */
  reached: z.boolean(),
  readinessCase: readinessCase.nullable(),
  liveCalls: z.array(liveCallRow),
  saved: finalReviewResult.nullable(),
});
export type FinalReviewFormResponse = z.infer<typeof finalReviewFormResponse>;

/**
 * PUT /api/manager/engineers/:id/final-review — record (or correct) the result. The API re-checks the
 * maths; `overrideNote` is required when the outcome isn't the one the scores point to. Refused while a
 * live-call day is still "later" (LIVE_CALLS_PENDING).
 */
export const saveFinalReviewRequest = z.object({
  heldAt: isoDateTime,
  observer: z.enum(OBSERVERS),
  call: z.string().trim().min(1, "Name the observed call.").max(200),
  criteria: gateCriteria,
  outcome: z.enum(FINAL_OUTCOMES),
  rag: z.enum(RAG),
  note: z.string().trim().min(1, "Add a one-line note.").max(300),
  overrideNote: z.string().trim().max(500).default(""),
});
export type SaveFinalReviewRequest = z.infer<typeof saveFinalReviewRequest>;

/** A row on the manager's Gates page. */
export const finalReviewListRow = z.object({
  engineer: personRef,
  status: z.enum(FINAL_STATUSES),
  reachedAt: isoDateTime.nullable(),
  pendingLive: z.number().int(),
  result: finalReviewResult.pick({ outcome: true, average: true, heldAt: true }).nullable(),
});

/** GET /api/manager/final-reviews — final reviews to book or recorded (shown on the Gates page). */
export const finalReviewListResponse = z.object({ reviews: z.array(finalReviewListRow) });
export type FinalReviewListResponse = z.infer<typeof finalReviewListResponse>;
