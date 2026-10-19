import { z } from "zod";

/**
 * Every error the API returns has one of these codes. The web app shows `message`, and may branch on
 * `code` (e.g. UNAUTHENTICATED → sign-in). Unexpected errors are always INTERNAL with a plain message.
 */
export const ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "INVALID_CREDENTIALS",
  "CSRF_REJECTED",
  "VALIDATION",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "SELF_ACCESS_CHANGE",
  "APPROVAL_NEEDS_TEAM_AND_START",
  "LAST_ADMIN",
  "TEAM_MEMBER_MUST_BE_ENGINEER",
  "TEAM_MANAGER_MUST_BE_MANAGER",
  "NO_ENROLLMENT",
  "DAY_LOCKED",
  "DAY_NOT_READY",
  "LESSON_NOT_IN_DAY",
  "ASSESSMENT_LOCKED",
  "RETAKE_NOT_YET",
  "STEPS_NOT_DONE",
  "QUIZ_NOT_READY",
  "QUIZ_ALREADY_ANSWERED",
  "NOTHING_TO_UNLOCK",
  "CHECKIN_NOT_REACHED",
  "CHECKIN_LOCKED",
  "GATE_NOT_REACHED",
  "GATE_RECORDED",
  "OVERRIDE_NOTE_REQUIRED",
  "FINAL_NOT_REACHED",
  "LIVE_CALLS_PENDING",
  "INTERNAL",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const apiErrorBody = z.object({
  code: z.enum(ERROR_CODES),
  message: z.string(),
  /** Field name → message, for VALIDATION errors. */
  fields: z.record(z.string(), z.string()).optional(),
});
export type ApiErrorBody = z.infer<typeof apiErrorBody>;

/** User-facing messages for expected failures; the API sends these, the web shows them as-is. */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  UNAUTHENTICATED: "Please sign in.",
  FORBIDDEN: "You don't have access to this.",
  INVALID_CREDENTIALS: "Wrong email or password.",
  CSRF_REJECTED: "This request was blocked. Reload the page and try again.",
  VALIDATION: "Check the form.",
  NOT_FOUND: "Not found.",
  CONFLICT: "That already exists.",
  RATE_LIMITED: "Too many requests. Wait a moment and try again.",
  SELF_ACCESS_CHANGE: "You can't change your own role or access. Ask another admin.",
  APPROVAL_NEEDS_TEAM_AND_START: "Choose a team and a start date to approve an engineer.",
  LAST_ADMIN: "At least one active admin must remain. Make someone else an admin first.",
  TEAM_MEMBER_MUST_BE_ENGINEER: "Only engineers can join a team.",
  TEAM_MANAGER_MUST_BE_MANAGER: "Only managers can manage a team.",
  NO_ENROLLMENT: "Your admin hasn't set your start date yet.",
  DAY_LOCKED: "This day isn't open yet. Finish the earlier days and checkpoints first.",
  DAY_NOT_READY: "This lesson isn't available yet.",
  LESSON_NOT_IN_DAY: "This day doesn't have that lesson.",
  ASSESSMENT_LOCKED: "Finish this week's days first. The assessment comes after the 5th day.",
  RETAKE_NOT_YET: "The retake isn't open yet.",
  STEPS_NOT_DONE: "Finish today's lessons first. The daily quiz comes last.",
  QUIZ_NOT_READY: "Today's quiz isn't available yet.",
  QUIZ_ALREADY_ANSWERED: "You've already answered this question.",
  NOTHING_TO_UNLOCK: "Nothing to unlock right now. Reload to see the engineer's latest progress.",
  CHECKIN_NOT_REACHED: "This check-in opens once the engineer has finished that day.",
  CHECKIN_LOCKED: "This check-in has been recorded, so your notes are locked.",
  GATE_NOT_REACHED: "The gate opens once its last day (20 or 40) is done.",
  GATE_RECORDED: "Your manager has already recorded this gate. The recap can't be changed now.",
  OVERRIDE_NOTE_REQUIRED: "This outcome goes against the pass bar. Add a note saying why.",
  FINAL_NOT_REACHED: "The final review opens once Day 64 is done and the readiness case is shared.",
  LIVE_CALLS_PENDING:
    "A live-call day is still scheduled for later. It must be done before the final review.",
  INTERNAL: "Something went wrong. Nothing was changed.",
};

/** Header every state-changing request must carry (CSRF defence, together with an Origin check). */
export const CSRF_HEADER = "x-portal-request";
