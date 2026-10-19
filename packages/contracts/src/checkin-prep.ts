import { z } from "zod";
import { isoDateTime } from "./common.js";

/**
 * Check-in prep (docs/PORTAL_PLAN.md M4, PDF §5.2): the engineer writes how a live spot-check went, where
 * they are stuck and what support they need. Their manager reads it before the check-in and records only
 * the rating and the one-line note.
 */

/** Bi-weekly check-ins after these days (end of Weeks 2, 6, 10, 12; Weeks 4 and 8 are the gates). */
export const CHECKIN_DAYS = [10, 30, 50, 60] as const;
export const checkinDay = z.coerce
  .number()
  .int()
  .refine(
    (day) => (CHECKIN_DAYS as readonly number[]).includes(day),
    "Check-ins follow Days 10, 30, 50 and 60.",
  );

export const checkinPrepParam = z.object({ day: checkinDay });

/** The engineer's three notes for one check-in. */
export const checkinPrep = z.object({
  /** A live spot-check or surprise question, and how it went. */
  spotCheck: z.string(),
  stuck: z.string(),
  /** Support needed: shadowing, a lighter week, pairing, a resource… */
  support: z.string(),
  updatedAt: isoDateTime,
});
export type CheckinPrep = z.infer<typeof checkinPrep>;

/** GET /api/me/checkins/:day — the engineer's prep for a check-in. */
export const checkinPrepResponse = z.object({
  afterDay: z.number().int(),
  /** False until the engineer has finished that day. */
  reached: z.boolean(),
  /** True once the manager has recorded the check-in: the notes are read-only. */
  locked: z.boolean(),
  prep: checkinPrep.nullable(),
});
export type CheckinPrepResponse = z.infer<typeof checkinPrepResponse>;

/** PUT /api/me/checkins/:day — save the notes (all optional). */
export const saveCheckinPrepRequest = z.object({
  spotCheck: z.string().trim().max(2000).default(""),
  stuck: z.string().trim().max(2000).default(""),
  support: z.string().trim().max(2000).default(""),
});
export type SaveCheckinPrepRequest = z.infer<typeof saveCheckinPrepRequest>;
