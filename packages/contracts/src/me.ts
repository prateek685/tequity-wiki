import { z } from "zod";
import { ROLES, STATUSES } from "./access.js";

/** GET /api/me — the signed-in user, read fresh from the database on every request. */
export const meResponse = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  role: z.enum(ROLES).nullable(),
  status: z.enum(STATUSES),
});
export type Me = z.infer<typeof meResponse>;
