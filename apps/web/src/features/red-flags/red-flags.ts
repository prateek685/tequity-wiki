import { type RedFlag, type RedFlagKind, RED_FLAG_TEXT } from "@portal/contracts";

/**
 * Red flags (docs/PORTAL_PLAN.md §3 "Red flags", PDF §5.4 word for word; docs/design/final-mockup.html
 * `flags()` and the flaglines in `team()`). Pure: unit-tested.
 */

export type RedFlagTab = "open" | "acknowledged";

/** The page's subtitle (the worker checks hourly, not nightly as the mockup says). */
export const RED_FLAGS_INTRO = "Checked every hour. Pause days are excluded.";

/** Empty state per tab. */
export function emptyText(status: RedFlagTab): string {
  return status === "open"
    ? "No red flags. Checked every hour; pause days are excluded."
    : "No acknowledged red flags yet.";
}

/** The line under an engineer's name on the Team page: the PDF's signal. */
export function flagLine(kind: RedFlagKind): string {
  return RED_FLAG_TEXT[kind].signal;
}

const SHORT_DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

/** "20 Nov" in the viewer's time zone. */
export function shortDate(iso: string): string {
  return SHORT_DATE.format(new Date(iso));
}

/** "Acknowledged by Priya Rao · 21 Nov", or null while open. */
export function acknowledgedLine(flag: Pick<RedFlag, "acknowledgedAt" | "acknowledgedBy">): string | null {
  if (!flag.acknowledgedAt) return null;
  const by = flag.acknowledgedBy ? ` by ${flag.acknowledgedBy.name}` : "";
  return `Acknowledged${by} · ${shortDate(flag.acknowledgedAt)}`;
}

/** The Red flags KPI's sub-label. */
export function redFlagsSub(open: number): string {
  return open === 0 ? "None open" : "open";
}
