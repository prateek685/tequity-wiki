import { z } from "zod";
import { checkinDay, checkinPrep } from "./checkin-prep.js";
import { isoDate, isoDateTime, personRef, RAG } from "./common.js";
import { FINAL_OUTCOMES, liveCallRow } from "./final-review.js";
import { PACE_STATUSES } from "./learning.js";
import { pillarScores, progressResponse, weeklyScorecard } from "./progress.js";
import { RED_FLAG_KINDS } from "./red-flags.js";

/**
 * Manager v1 (docs/PORTAL_PLAN.md §1 "Privacy", §3, §9 "Manager"; PDF §5.2 check-ins, §5.5 tracker; final
 * mockup "Team" and "Answer reviews"). A manager sees the engineers on the teams they manage: completion,
 * scores, scorecards, and the written answers of assessments. Never prep, journal, daily-quiz answers,
 * write submissions, mock notes or AI feedback text outside assessments.
 */

/**
 * next_day: open the engineer's first locked day now (whatever blocks it: a failed assessment, a missing
 * scorecard, an unfinished earlier day) · retake_now: a failed assessment can be retaken without the wait.
 */
export const UNLOCK_KINDS = ["next_day", "retake_now"] as const;
export type UnlockKind = (typeof UNLOCK_KINDS)[number];

/** What "Unlock" would do for an engineer right now, or null when nothing is locked. */
export const unlockOption = z.object({
  kind: z.enum(UNLOCK_KINDS),
  /** next_day: the day it opens · retake_now: the assessment's day (5, 10 …). */
  day: z.number().int(),
  /** e.g. "Open Day 6" or "Allow the Week 1 assessment retake now". */
  label: z.string(),
});
export type UnlockOption = z.infer<typeof unlockOption>;

// ── Team ────────────────────────────────────────────────────────────────────────────────────────

export const teamEngineer = z.object({
  id: z.uuid(),
  name: z.string(),
  teamName: z.string(),
  startDate: isoDate.nullable(),
  targetDate: isoDate.nullable(),
  daysDone: z.number().int().min(0).max(65),
  /** The lowest open day, null when none (not started or all done). */
  currentDay: z.number().int().nullable(),
  pace: z.object({ status: z.enum(PACE_STATUSES), difference: z.number().int() }).nullable(),
  /** Latest per pillar (scorecard, else the Day-1 baseline); null = no score yet. */
  pillars: pillarScores,
  /** From the latest check-in; null before the first one. */
  rag: z.enum(RAG).nullable(),
  /** The next checkpoint, e.g. "Assessment after Day 25", "Check-in after Day 10". */
  next: z.string().nullable(),
  unlock: unlockOption.nullable(),
  /** Open (unacknowledged) red flags, shown under the name. */
  flags: z.array(z.enum(RED_FLAG_KINDS)).default([]),
  /** The final review decision, null until recorded. */
  finalOutcome: z.enum(FINAL_OUTCOMES).nullable().default(null),
});
export type TeamEngineer = z.infer<typeof teamEngineer>;

/** A "This week" row on the Team page: check-ins and gates that are due. */
export const teamTask = z.object({
  engineer: personRef,
  /** e.g. "Check-in · Rohan Patel". */
  title: z.string(),
  /** e.g. "After Day 10 · overdue 4 days". */
  detail: z.string(),
  /** Due (Day done ≤ 7 days ago) or overdue. */
  status: z.enum(["due", "overdue"]),
  /** An app path, e.g. /manager/engineers/:id/checkins/:day. */
  href: z.string(),
});
export type TeamTask = z.infer<typeof teamTask>;

/** GET /api/manager/team — the manager's Team page. */
export const teamResponse = z.object({
  engineers: z.array(teamEngineer),
  kpis: z.object({
    engineers: z.number().int(),
    /** Engineers on pace or ahead. */
    onTrack: z.number().int(),
    checkinsDue: z.number().int(),
    /** Open red flags across the team. */
    redFlags: z.number().int().default(0),
    /** Average pace difference in days (positive = behind), null without started engineers. */
    averagePace: z.number().nullable(),
  }),
  tasks: z.array(teamTask),
});
export type TeamResponse = z.infer<typeof teamResponse>;

// ── Engineer detail ─────────────────────────────────────────────────────────────────────────────

/** A check-in as recorded by the manager (PDF §5.2). The engineer sees it too. */
export const checkin = z.object({
  afterDay: z.number().int(),
  week: z.number().int(),
  heldOn: isoDate,
  rag: z.enum(RAG),
  /** One line for the tracker. */
  note: z.string(),
  by: personRef,
  updatedAt: isoDateTime,
});
export type Checkin = z.infer<typeof checkin>;

/** One row of the 13-week tracker (PDF §5.5). */
export const trackerWeek = z.object({
  week: z.number().int().min(1).max(13),
  daysDone: z.number().int().min(0).max(5),
  /** The week's scorecard (rated or carried forward), null when not submitted. */
  pillars: pillarScores.nullable(),
  checkpoint: z.enum(["checkin", "gate1", "gate2", "final"]).nullable(),
  rag: z.enum(RAG).nullable(),
  note: z.string().nullable(),
});
export type TrackerWeek = z.infer<typeof trackerWeek>;

export const unlockRecord = z.object({
  kind: z.enum(UNLOCK_KINDS),
  day: z.number().int(),
  reason: z.string(),
  by: personRef,
  at: isoDateTime,
});
export type UnlockRecord = z.infer<typeof unlockRecord>;

/** GET /api/manager/engineers/:id — one engineer: progress charts, tracker, check-ins, unlocks. No private content. */
export const engineerDetailResponse = z.object({
  engineer: z.object({
    id: z.uuid(),
    name: z.string(),
    teamName: z.string(),
    startDate: isoDate.nullable(),
    targetDate: isoDate.nullable(),
  }),
  progress: progressResponse,
  tracker: z.array(trackerWeek),
  checkins: z.array(checkin),
  /** Check-in days reached (the day is done) without a check-in yet. */
  checkinsDue: z.array(z.number().int()),
  unlocks: z.array(unlockRecord),
  unlock: unlockOption.nullable(),
  /** Phase 3 live-call days (path only; the call sheet stays private). */
  liveCalls: z.array(liveCallRow).default([]),
});
export type EngineerDetailResponse = z.infer<typeof engineerDetailResponse>;

/** POST /api/manager/engineers/:id/unlock — unlock with a reason (saved to history and audited). */
export const unlockRequest = z.object({
  kind: z.enum(UNLOCK_KINDS),
  /** Must match the engineer's current `unlock` option (stale pages get CONFLICT). */
  day: z.number().int().min(1).max(65),
  reason: z.string().trim().min(5, "Say why, in a few words.").max(500),
});
export type UnlockRequest = z.infer<typeof unlockRequest>;

// ── Check-ins ───────────────────────────────────────────────────────────────────────────────────

export const checkinParam = z.object({ id: z.uuid(), day: checkinDay });

/** GET /api/manager/engineers/:id/checkins/:day — the check-in form. */
export const checkinFormResponse = z.object({
  engineer: personRef,
  afterDay: z.number().int(),
  week: z.number().int(),
  /** False until the engineer has finished that day (the form can't be saved yet). */
  reached: z.boolean(),
  /** Step 1 "Score trend": the last two submitted scorecards, oldest first. */
  scorecards: z.array(weeklyScorecard).max(2),
  /** The engineer's own notes for this check-in (read-only here), null until they write any. */
  prep: checkinPrep.nullable(),
  checkin: checkin.nullable(),
});
export type CheckinFormResponse = z.infer<typeof checkinFormResponse>;

/** PUT /api/manager/engineers/:id/checkins/:day — record or update the check-in. */
export const saveCheckinRequest = z.object({
  heldOn: isoDate,
  rag: z.enum(RAG),
  note: z.string().trim().min(1, "Add a one-line note.").max(300),
});
export type SaveCheckinRequest = z.infer<typeof saveCheckinRequest>;
