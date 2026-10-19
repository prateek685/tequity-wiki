const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "2 Feb 2027" from a YYYY-MM-DD date. Fixed locale and UTC, so every viewer sees the same day. */
export function formatDate(isoDate: string): string {
  return DATE_FORMAT.format(new Date(`${isoDate}T00:00:00.000Z`));
}
