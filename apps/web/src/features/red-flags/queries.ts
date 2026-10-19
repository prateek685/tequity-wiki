import { redFlagListResponse, type RedFlagListResponse } from "@portal/contracts";
import { queryOptions } from "@tanstack/react-query";
import { apiGet, apiSend } from "@/lib/api";
import { type RedFlagTab } from "./red-flags";

/** Under ["manager"], so `managerKeys.all` covers them. */
export const redFlagKeys = {
  all: ["manager", "red-flags"] as const,
  list: (status: RedFlagTab) => ["manager", "red-flags", status] as const,
};

/** The manager's engineers' red flags (`open` also feeds the menu badge). */
export const redFlagsQuery = (status: RedFlagTab) =>
  queryOptions({
    queryKey: redFlagKeys.list(status),
    queryFn: () => apiGet(`/manager/red-flags?status=${status}`, redFlagListResponse),
  });

/** Acknowledge a flag (audited). Returns the open list. */
export async function acknowledgeFlag(id: string): Promise<RedFlagListResponse | undefined> {
  return apiSend("POST", `/manager/red-flags/${id}/acknowledge`, undefined, redFlagListResponse);
}
