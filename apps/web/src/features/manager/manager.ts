import {
  type PaceStatus,
  type PillarScores,
  PILLARS,
  type Rag,
  type TeamResponse,
  type TrackerWeek,
} from "@portal/contracts";

/**
 * Manager v1 screens (docs/design/final-mockup.html `team()` / `review()`, PDF §5.2 check-ins, §5.5
 * tracker). Pure: unit-tested.
 */

const MINUS = "−";

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** "Priya" from "Priya Rao". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** "Good morning" / "Good afternoon" / "Good evening" for a local hour 0–23. */
export function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** An engineer's pace in the Team table: "On pace", "6 days behind", "1 day ahead", "Not started". */
export function paceText(pace: { status: PaceStatus; difference: number } | null): string {
  if (!pace) return "—";
  switch (pace.status) {
    case "not_started":
      return "Not started";
    case "on_pace":
      return "On pace";
    case "behind":
      return `${plural(Math.max(1, Math.abs(pace.difference)), "day")} behind`;
    case "ahead":
      return `${plural(Math.max(1, Math.abs(pace.difference)), "day")} ahead`;
  }
}

/** The Average pace tile: positive `averagePace` = behind, shown as "−2 days"; ahead is "+3 days". */
export function averagePaceText(averagePace: number | null): string {
  if (averagePace === null) return "—";
  const days = Math.round(averagePace);
  if (days === 0) return "On pace";
  const text = plural(Math.abs(days), "day");
  return days > 0 ? `${MINUS}${text}` : `+${text}`;
}

/** The Needs you tile: the count and its breakdown ("2 check-ins"). */
export function needsYou(kpis: Pick<TeamResponse["kpis"], "checkinsDue">): {
  value: number;
  sub: string;
} {
  return {
    value: kpis.checkinsDue,
    sub: kpis.checkinsDue > 0 ? plural(kpis.checkinsDue, "check-in") : "Nothing waiting",
  };
}

/** The Day column: "25 / 65" from the current day, else the days done; "—" before Day 1. */
export function dayText(engineer: { currentDay: number | null; daysDone: number }): string {
  const day = engineer.currentDay ?? (engineer.daysDone > 0 ? engineer.daysDone : null);
  return day === null ? "—" : `${day} / 65`;
}

/** A pillar score as a short number: "3", "2.5", or "—". */
export function pillarValue(score: number | null): string {
  if (score === null) return "—";
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

/** Pillars U · C · O · S in order, with `low` for values at or below 2 (the mockup's bad colour). */
export function pillarCells(scores: PillarScores): { pillar: string; text: string; low: boolean }[] {
  return PILLARS.map((pillar) => {
    const score = scores[pillar];
    return { pillar, text: pillarValue(score), low: score !== null && score <= 2 };
  });
}

export type PillTone = "success" | "warning" | "danger" | "neutral" | "accent";

/** Status pill from a check-in's G/A/R (PDF §5.2). Green uses the success tone: it means "on track". */
export const RAG_PILL: Record<Rag, { label: string; short: string; tone: PillTone }> = {
  green: { label: "On track", short: "Green", tone: "success" },
  amber: { label: "Needs focus", short: "Amber", tone: "warning" },
  red: { label: "Off track", short: "Red", tone: "danger" },
};

/** The PDF §5.2 meaning of each rating, for the check-in form. */
export const RAG_MEANING: Record<Rag, string> = {
  green: "On track.",
  amber: "One pillar behind, plan agreed.",
  red: "Off track or a red flag. Support starts this week.",
};

/** "This week" pill per task status. */
export const TASK_PILL: Record<"due" | "overdue", { label: string; tone: PillTone; dot: boolean }> = {
  due: { label: "Due", tone: "warning", dot: true },
  overdue: { label: "Overdue", tone: "danger", dot: true },
};

/** Tracker checkpoint column (PDF §5.5). */
export const CHECKPOINT_TEXT: Record<NonNullable<TrackerWeek["checkpoint"]>, string> = {
  checkin: "Check-in",
  gate1: "Gate 1",
  gate2: "Gate 2",
  final: "Final review",
};

/** "U C O S" for a tracker row, e.g. "3 · 4 · 3 · 3", or "—" without a scorecard. */
export function trackerPillars(pillars: PillarScores | null): string {
  if (!pillars) return "—";
  return PILLARS.map((pillar) => pillarValue(pillars[pillar])).join(" · ");
}

/** The unlock reason must be at least 5 characters (contracts `unlockRequest`). */
export function reasonOk(reason: string): boolean {
  return reason.trim().length >= 5;
}

/** Today as YYYY-MM-DD in the viewer's time zone (the check-in "Held on" default). */
export function todayIso(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export type TaskTarget =
  | { kind: "checkin"; id: string; day: number }
  | { kind: "gate"; id: string; gate: 1 | 2 }
  | { kind: "engineer"; id: string };

/** A "This week" task's `href` as a typed route (null for anything else). */
export function taskTarget(href: string): TaskTarget | null {
  const checkin = /^\/manager\/engineers\/([^/?#]+)\/checkins\/(\d+)$/.exec(href);
  if (checkin?.[1] && checkin[2]) return { kind: "checkin", id: checkin[1], day: Number(checkin[2]) };
  const gate = /^\/manager\/engineers\/([^/?#]+)\/gates\/([12])$/.exec(href);
  if (gate?.[1]) return { kind: "gate", id: gate[1], gate: gate[2] === "2" ? 2 : 1 };
  const engineer = /^\/manager\/engineers\/([^/?#]+)$/.exec(href);
  if (engineer?.[1]) return { kind: "engineer", id: engineer[1] };
  return null;
}
