import { z } from "zod";
import { isoDateTime, personRef } from "./common.js";

/**
 * Red flags (PDF §5.4, followed exactly — user decision 11 Oct 2026; docs/PORTAL_PLAN.md §3). Checked by
 * the worker (hourly); pause days are excluded. Each flag shows the PDF's signal, what it may mean and the
 * management action, word for word. A flag stays open until the manager acknowledges it; it is raised
 * again only if the signal comes back after it cleared.
 *
 * How the portal measures each signal:
 * - scorecard_missing: no new Friday scorecard for 14 days (2 weeks) while the engineer is past Day 5 and
 *   not finished.
 * - pillar_low: the same pillar at 2 or below on 3 scorecards in a row (rated or carried forward).
 * - self_vs_gate: a gate's average for a pillar (rubric → pillar mapping) and the scorecard of that week
 *   differ by 2 or more.
 * - few_practice_days: fewer than 3 practice days (days with any lesson, quiz or assessment done) in each of
 *   the last 2 seven-day periods.
 * - avoiding_live: 2 or more live-call deferrals or substitutes in Phase 3 (from M7; never raised before).
 * - gate_not_passed: a gate recorded with outcome "repeat".
 */
export const RED_FLAG_KINDS = [
  "scorecard_missing",
  "pillar_low",
  "self_vs_gate",
  "few_practice_days",
  "avoiding_live",
  "gate_not_passed",
] as const;
export type RedFlagKind = (typeof RED_FLAG_KINDS)[number];

/** PDF §5.4, word for word. */
export const RED_FLAG_TEXT: Record<RedFlagKind, { signal: string; meaning: string; action: string }> = {
  scorecard_missing: {
    signal: "Scorecard missing 2 weeks in a row",
    meaning: "Workload too high, or losing motivation",
    action: "1:1 this week. Protect a fixed 45-minute slot. Reduce project load if needed.",
  },
  pillar_low: {
    signal: "The same pillar at 2 or below for 3 weeks",
    meaning: "Stuck on a specific skill",
    action: "Pair with a strong client-facing engineer for two sessions. Add targeted mocks for that pillar.",
  },
  self_vs_gate: {
    signal: "Self-score and gate score differ by 2 or more",
    meaning: "Over- or under-confidence",
    action: "Review the rubric together with examples, to calibrate.",
  },
  few_practice_days: {
    signal: "Fewer than 3 practice days a week, for 2 weeks",
    meaning: "The habit hasn't formed",
    action: "Move the block to a fixed time. Add a buddy check-in.",
  },
  avoiding_live: {
    signal: "Avoiding shadowing or co-lead opportunities in Phase 3",
    meaning: "Anxiety about live calls",
    action:
      "Start with a smaller live role (the status update only). The manager joins the first co-lead for support.",
  },
  gate_not_passed: {
    signal: "A gate not passed",
    meaning: "Skills not yet at the bar",
    action: "Repeat two focus weeks and re-run the gate. No penalty.",
  },
};

export const redFlag = z.object({
  id: z.uuid(),
  engineer: personRef,
  kind: z.enum(RED_FLAG_KINDS),
  /** The specifics, e.g. "Stand firm: 2, 2, 1 (Weeks 3–5)" or "Gate 1, round 1". */
  detail: z.string(),
  raisedAt: isoDateTime,
  acknowledgedAt: isoDateTime.nullable(),
  acknowledgedBy: personRef.nullable(),
});
export type RedFlag = z.infer<typeof redFlag>;

export const redFlagListQuery = z.object({
  status: z.enum(["open", "acknowledged"]).default("open").catch("open"),
});

/** GET /api/manager/red-flags?status= — the manager's engineers' flags (open: not acknowledged yet). */
export const redFlagListResponse = z.object({
  flags: z.array(redFlag),
  open: z.number().int(),
});
export type RedFlagListResponse = z.infer<typeof redFlagListResponse>;

/** POST /api/manager/red-flags/:id/acknowledge — the manager has seen it (audited). Returns the list. */
export const redFlagParam = z.object({ id: z.uuid() });
