import { journalResponse, progressResponse } from "@portal/contracts";
import { queryOptions } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

export const progressKeys = {
  progress: ["me", "progress"] as const,
  journal: ["me", "journal"] as const,
};

/** The engineer's Progress page: days, assessments, scorecards, Day 1 → now, call rubric. */
export const progressQuery = queryOptions({
  queryKey: progressKeys.progress,
  queryFn: () => apiGet("/me/progress", progressResponse),
});

/** Everything the engineer wrote in lessons, newest day first. Private to the engineer. */
export const journalQuery = queryOptions({
  queryKey: progressKeys.journal,
  queryFn: () => apiGet("/me/journal", journalResponse),
});
