import { type Role } from "@portal/contracts";
import {
  BookOpen,
  CalendarDays,
  ChartLine,
  ClipboardCheck,
  Flag,
  House,
  Library,
  ListChecks,
  Lock,
  type LucideIcon,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";

interface NavBase {
  label: string;
  /** Label in the phone tab bar. */
  short: string;
  icon: LucideIcon;
  /** Small text at the right of the sidebar item, e.g. "Day 2". */
  count?: string;
  /** False: sidebar only, not in the phone tab bar (it has room for five). */
  tab?: boolean;
}

export type NavItem =
  | (NavBase & {
      to:
        | "/app"
        | "/app/plan"
        | "/app/progress"
        | "/app/journal"
        | "/app/library"
        | "/app/overview"
        | "/manager"
        | "/manager/gates"
        | "/manager/red-flags"
        | "/admin/settings";
      /** Active only on this exact path (Home must not stay highlighted on My plan). */
      exact?: boolean;
      /** Also active below this path (Team stays highlighted on an engineer's pages). */
      activeBelow?: string;
    })
  | (NavBase & { to: "/app/day/$day" | "/app/assessment/$day"; day: number });

/**
 * Each role sees only its own menu (docs/PORTAL_PLAN.md §9), and only screens that exist so far.
 * The engineer's "Today" item depends on their plan: see `engineerNav`.
 */
export const NAV_BY_ROLE: Record<Role, { area: string; items: NavItem[] }> = {
  engineer: {
    area: "Training",
    items: [
      { to: "/app", label: "Home", short: "Home", icon: House, exact: true },
      { to: "/app/plan", label: "My plan", short: "My plan", icon: ListChecks },
      { to: "/app/progress", label: "Progress", short: "Progress", icon: ChartLine },
      { to: "/app/journal", label: "Journal", short: "Journal", icon: Lock },
      { to: "/app/library", label: "Library", short: "Library", icon: Library, tab: false },
      { to: "/app/overview", label: "Overview", short: "Overview", icon: BookOpen, tab: false },
    ],
  },
  manager: {
    area: "My team",
    items: [
      {
        to: "/manager",
        label: "Team",
        short: "Team",
        icon: Users,
        exact: true,
        activeBelow: "/manager/engineers",
      },
      { to: "/manager/gates", label: "Gates", short: "Gates", icon: ShieldCheck },
      { to: "/manager/red-flags", label: "Red flags", short: "Flags", icon: Flag },
    ],
  },
  admin: {
    // Users and Teams live at the wiki level (AdminShell); only the course's settings are here.
    area: "Course settings",
    items: [{ to: "/admin/settings", label: "Settings", short: "Settings", icon: Settings }],
  },
};

/**
 * Engineer menu, in the mockup's order: Home, Today (the current day, when one is open), My plan,
 * Assessment (the current or next one, once the outline has loaded), Progress, Journal, Overview.
 * The phone tab bar shows Home, Today, My plan, Progress, Journal.
 */
export function engineerNav(currentDay: number | null, assessmentDay: number | null = null): NavItem[] {
  const [home, plan, progress, journal, library, overview] = NAV_BY_ROLE.engineer.items;
  if (!home || !plan || !progress || !journal || !library || !overview) return NAV_BY_ROLE.engineer.items;
  const today: NavItem | null =
    currentDay === null
      ? null
      : {
          to: "/app/day/$day",
          day: currentDay,
          label: "Today",
          short: "Today",
          icon: CalendarDays,
          count: `Day ${currentDay}`,
        };
  const assessment: NavItem | null =
    assessmentDay === null
      ? null
      : {
          to: "/app/assessment/$day",
          day: assessmentDay,
          label: "Assessment",
          short: "Assessment",
          icon: ClipboardCheck,
          tab: false,
        };
  return [home, today, plan, assessment, progress, journal, library, overview].filter(
    (item) => item !== null,
  );
}

/**
 * Manager menu: Gates shows how many to book, record or re-run, Red flags how many are open (nothing
 * while a count loads or is 0).
 */
export function managerNav(gates: number | null = null, flags: number | null = null): NavItem[] {
  return NAV_BY_ROLE.manager.items.map((item) => {
    if (item.to === "/manager/gates" && gates) return { ...item, count: String(gates) };
    if (item.to === "/manager/red-flags" && flags) return { ...item, count: String(flags) };
    return item;
  });
}

/** True when `pathname` is at or below `prefix` ("/manager/engineers" matches "/manager/engineers/x"). */
export function isBelow(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

const PAGE_NAMES: Record<string, string> = {
  "/app": "Home",
  "/app/plan": "My plan",
  "/app/progress": "Progress",
  "/app/journal": "Journal",
  "/app/overview": "Overview",
  "/manager": "Team",
  "/manager/gates": "Gates",
  "/manager/red-flags": "Red flags",
  "/admin/settings": "Settings",
};

/** Pages below a list: the list's name, then the page's. */
const NESTED: [RegExp, string[]][] = [
  [/^\/manager\/engineers\/[^/]+\/checkins\/\d+$/, ["Team", "Engineer", "Check-in"]],
  [/^\/manager\/engineers\/[^/]+\/gates\/\d+$/, ["Team", "Engineer", "Gate"]],
  [/^\/manager\/engineers\/[^/]+$/, ["Team", "Engineer"]],
];

/** Breadcrumb after the area name: "Home", "My plan". Pure. (Day pages are the full-screen player.) */
export function crumbFor(pathname: string): string[] {
  const path = pathname.replace(/\/+$/, "") || "/";
  const name = PAGE_NAMES[path];
  if (name) return [name];
  return NESTED.find(([pattern]) => pattern.test(path))?.[1] ?? [];
}
