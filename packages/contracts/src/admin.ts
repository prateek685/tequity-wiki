import { z } from "zod";
import { ROLES, STATUSES } from "./access.js";
import { isoDate, isoDateTime, personRef } from "./common.js";

const emptyToNull = (value: unknown) =>
  value === "" || value === undefined || value === null ? null : value;

// ── Users ───────────────────────────────────────────────────────────────────────────────────────

/** GET /api/admin/users?page= */
export const adminUserRow = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  role: z.enum(ROLES).nullable(),
  status: z.enum(STATUSES),
  teamId: z.uuid().nullable(),
  /** Active enrollment, if any. */
  startDate: isoDate.nullable(),
  targetDate: isoDate.nullable(),
  lastLoginAt: isoDateTime.nullable(),
});
export type AdminUserRow = z.infer<typeof adminUserRow>;

export const teamOption = z.object({ id: z.uuid(), name: z.string() });
export type TeamOption = z.infer<typeof teamOption>;

export const listUsersResponse = z.object({
  users: z.array(adminUserRow),
  teams: z.array(teamOption),
  total: z.number().int(),
  pendingTotal: z.number().int(),
});
export type ListUsersResponse = z.infer<typeof listUsersResponse>;

/**
 * PATCH /api/admin/users/:id — an admin edits a user's role, access, team and start date.
 * Team and start date apply to engineers only. Empty form values arrive as "" and mean "none".
 */
export const updateUserAccessRequest = z
  .object({
    role: z.enum(ROLES),
    status: z.enum(["active", "disabled"]),
    teamId: z.preprocess(emptyToNull, z.uuid().nullable()),
    startDate: z.preprocess(emptyToNull, isoDate.nullable()),
  })
  .refine((value) => value.role === "engineer" || (value.teamId === null && value.startDate === null), {
    message: "Only engineers have a team membership and a start date.",
    path: ["role"],
  });
export type UpdateUserAccessRequest = z.infer<typeof updateUserAccessRequest>;

// ── Teams ───────────────────────────────────────────────────────────────────────────────────────

/** GET /api/admin/teams?page= */
export const adminTeamRow = z.object({
  id: z.uuid(),
  name: z.string(),
  engineerCount: z.number().int(),
  managers: z.array(personRef),
});
export type AdminTeamRow = z.infer<typeof adminTeamRow>;

export const listTeamsResponse = z.object({
  teams: z.array(adminTeamRow),
  /** Active managers that can be assigned to a team. */
  managers: z.array(personRef),
  total: z.number().int(),
});
export type ListTeamsResponse = z.infer<typeof listTeamsResponse>;

/** POST /api/admin/teams */
export const createTeamRequest = z.object({
  name: z.string().trim().min(2, "Team name must be at least 2 characters.").max(60),
});
export type CreateTeamRequest = z.infer<typeof createTeamRequest>;

/** POST /api/admin/teams/:id/managers  ·  DELETE /api/admin/teams/:id/managers/:userId */
export const teamManagerRequest = z.object({ userId: z.uuid("Choose a manager.") });
export type TeamManagerRequest = z.infer<typeof teamManagerRequest>;

// ── Settings ────────────────────────────────────────────────────────────────────────────────────

/** Settings an admin can change on the Settings screen (other keys stay in migrations). */
export const EDITABLE_SETTINGS = {
  "assessment.passPercent": {
    label: "Assessment pass mark (multiple choice only)",
    type: "int",
    min: 1,
    max: 100,
    unit: "%",
  },
  "assessment.retakeHours": { label: "Wait before a retake", type: "int", min: 0, max: 168, unit: "hours" },
  "pace.behindToleranceDays": { label: "Behind-pace note after", type: "int", min: 0, max: 30, unit: "days" },
  "learning.unlockAll": {
    label: "Open every day and lesson (content review)",
    type: "bool",
    help: "Turn off before engineers start: lessons, assessments and scorecards then unlock in order.",
  },
  "ai.scoreRealProjectAnswers": {
    label: "AI-score real-project answers",
    type: "bool",
    help: "Leave off until a no-training model is approved.",
  },
} as const satisfies Record<
  string,
  { label: string; type: "int" | "bool"; min?: number; max?: number; unit?: string; help?: string }
>;
export type SettingKey = keyof typeof EDITABLE_SETTINGS;
export const SETTING_KEYS = Object.keys(EDITABLE_SETTINGS) as SettingKey[];

export const settingValue = z.union([z.number().int(), z.boolean()]);

/** GET /api/admin/settings */
export const settingsResponse = z.object({
  values: z.record(z.string(), settingValue),
  /** The AI scorer: anthropic (key set) · fake (development without a key) · off (production without a key: answers wait). */
  ai: z.object({
    mode: z.enum(["anthropic", "fake", "off"]),
    model: z.string(),
    pending: z.number().int(),
    failed: z.number().int(),
  }),
});
export type SettingsResponse = z.infer<typeof settingsResponse>;

/** PUT /api/admin/settings — only the keys sent change; each is checked against EDITABLE_SETTINGS (audited). */
export const updateSettingsRequest = z.object({ values: z.record(z.string(), settingValue) });
export type UpdateSettingsRequest = z.infer<typeof updateSettingsRequest>;
