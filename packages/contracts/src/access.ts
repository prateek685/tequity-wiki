/** Roles, account statuses and where each user lands (docs/PORTAL_PLAN.md §1 "Roles"). */

export const ROLES = ["engineer", "manager", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const STATUSES = ["pending", "active", "disabled"] as const;
export type Status = (typeof STATUSES)[number];

/** Each role has exactly one area of the web app. */
export type Area = "app" | "manager" | "admin";

export const AREA_BY_ROLE: Record<Role, Area> = {
  engineer: "app",
  manager: "manager",
  admin: "admin",
};

export const SIGN_IN_PATH = "/sign-in";
export const PENDING_PATH = "/pending";
/** The Tequity.wiki home: every signed-in user lands here and opens their course from it. */
export const WIKI_HOME_PATH = "/home";

/** A role's own area of the web app: where "Open course" goes. */
export function areaPathFor(role: Role): string {
  return `/${AREA_BY_ROLE[role]}`;
}

export interface AccessSubject {
  role: Role | null;
  status: Status;
}

/** Where a signed-in user should land: the wiki home, or the waiting or sign-in page. Used by the API after sign-in and by the web route guards. */
export function homePathFor(subject: AccessSubject): string {
  if (subject.status === "disabled") return `${SIGN_IN_PATH}?error=AccessDenied`;
  if (subject.status === "pending" || subject.role === null) return PENDING_PATH;
  return WIKI_HOME_PATH;
}
