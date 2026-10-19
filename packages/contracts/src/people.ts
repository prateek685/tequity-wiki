import { z } from "zod";
import { isoDate } from "./common.js";

/** GET /api/me/enrollment — the engineer's active enrollment, or null. */
export const myEnrollmentResponse = z
  .object({
    startDate: isoDate,
    targetDate: isoDate,
    cycleNo: z.number().int(),
  })
  .nullable();
export type MyEnrollment = z.infer<typeof myEnrollmentResponse>;

/** GET /api/manager/engineers?page= — engineers on the teams the manager manages (RLS decides). */
export const teamEngineerRow = z.object({
  id: z.uuid(),
  name: z.string(),
  teamName: z.string(),
  startDate: isoDate.nullable(),
  targetDate: isoDate.nullable(),
});
export type TeamEngineerRow = z.infer<typeof teamEngineerRow>;

export const listMyEngineersResponse = z.object({
  engineers: z.array(teamEngineerRow),
  total: z.number().int(),
});
export type ListMyEngineersResponse = z.infer<typeof listMyEngineersResponse>;
