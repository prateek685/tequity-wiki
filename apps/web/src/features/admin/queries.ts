import {
  listTeamsResponse,
  listUsersResponse,
  settingsResponse,
  type UpdateSettingsRequest,
} from "@portal/contracts";
import { queryOptions } from "@tanstack/react-query";
import { apiGet, apiSend } from "@/lib/api";

export const adminKeys = {
  users: ["admin", "users"] as const,
  teams: ["admin", "teams"] as const,
  settings: ["admin", "settings"] as const,
};

export const usersQuery = (page: number) =>
  queryOptions({
    queryKey: [...adminKeys.users, page],
    queryFn: () => apiGet(`/admin/users?page=${page}`, listUsersResponse),
  });

export const teamsQuery = (page: number) =>
  queryOptions({
    queryKey: [...adminKeys.teams, page],
    queryFn: () => apiGet(`/admin/teams?page=${page}`, listTeamsResponse),
  });

/** Editable settings and the AI scorer's state. */
export const settingsQuery = queryOptions({
  queryKey: adminKeys.settings,
  queryFn: () => apiGet("/admin/settings", settingsResponse),
});

/** Only the keys sent change (each is checked and audited by the API). */
export async function updateSettings(request: UpdateSettingsRequest): Promise<void> {
  await apiSend("PUT", "/admin/settings", request);
}
