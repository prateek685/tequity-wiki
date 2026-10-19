/** Postgres `date` columns arrive as Date at UTC midnight. Keep conversions in one place. */

const DAY_MS = 86_400_000;

export function dateFromIso(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function isoFromDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The calendar the plan follows unless the `plan.timezone` setting says otherwise. */
export const DEFAULT_TIMEZONE = "Asia/Kolkata";

/**
 * Today's calendar date as YYYY-MM-DD in `timeZone` (an IANA name). Unlocking and pace follow the
 * team's calendar, not UTC: in India, UTC's "today" starts at 05:30.
 */
export function todayIso(now: Date = new Date(), timeZone: string = DEFAULT_TIMEZONE): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    // An invalid setting must not take the portal down: fall back to the default calendar.
    return new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_TIMEZONE }).format(now);
  }
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((dateFromIso(to).getTime() - dateFromIso(from).getTime()) / DAY_MS);
}
