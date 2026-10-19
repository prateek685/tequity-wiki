import {
  checkinFormResponse,
  engineerDetailResponse,
  type SaveCheckinRequest,
  teamResponse,
  type UnlockRequest,
} from "@portal/contracts";
import { queryOptions } from "@tanstack/react-query";
import { apiGet, apiSend } from "@/lib/api";

export const managerKeys = {
  all: ["manager"] as const,
  team: ["manager", "team"] as const,
  engineer: (id: string) => ["manager", "engineer", id] as const,
  checkin: (id: string, day: number) => ["manager", "engineer", id, "checkin", day] as const,
};

/** The Team page: engineers, KPIs and "This week". */
export const teamQuery = queryOptions({
  queryKey: managerKeys.team,
  queryFn: () => apiGet("/manager/team", teamResponse),
});

/** One engineer: progress, the 13-week tracker, check-ins, unlocks. No private content. */
export const engineerQuery = (id: string) =>
  queryOptions({
    queryKey: managerKeys.engineer(id),
    queryFn: () => apiGet(`/manager/engineers/${id}`, engineerDetailResponse),
  });

export const checkinQuery = (id: string, day: number) =>
  queryOptions({
    queryKey: managerKeys.checkin(id, day),
    queryFn: () => apiGet(`/manager/engineers/${id}/checkins/${day}`, checkinFormResponse),
  });

export async function unlockEngineer(id: string, request: UnlockRequest): Promise<void> {
  await apiSend("POST", `/manager/engineers/${id}/unlock`, request);
}

export async function saveCheckin(id: string, day: number, request: SaveCheckinRequest): Promise<void> {
  await apiSend("PUT", `/manager/engineers/${id}/checkins/${day}`, request);
}
