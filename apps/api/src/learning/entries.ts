import { lessonEntry, type LessonEntry } from "@portal/contracts";

/** A stored entry; rows saved before the course player (old step shapes) read as empty parts. */
export function parseEntry(value: unknown): LessonEntry {
  const parsed = lessonEntry.safeParse(value);
  return parsed.success ? parsed.data : lessonEntry.parse({});
}
