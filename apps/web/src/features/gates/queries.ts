import {
  gateFormResponse,
  gateListResponse,
  gateViewResponse,
  type SaveGateRecapRequest,
  type SaveGateRequest,
} from "@portal/contracts";
import { queryOptions } from "@tanstack/react-query";
import { apiGet, apiSend } from "@/lib/api";

/** Gate keys: the engineer's under ["me"], the manager's under ["manager"] (so `managerKeys.all` covers them). */
export const gateKeys = {
  mine: (gate: number) => ["me", "gate", gate] as const,
  list: ["manager", "gates"] as const,
  form: (id: string, gate: number) => ["manager", "engineer", id, "gate", gate] as const,
};

/** The engineer's Gate page: status, recap, result, history and repeat days. */
export const myGateQuery = (gate: number) =>
  queryOptions({
    queryKey: gateKeys.mine(gate),
    queryFn: () => apiGet(`/me/gates/${gate}`, gateViewResponse),
  });

/** Write or edit the recap (until the manager records the result). */
export async function saveRecap(gate: number, request: SaveGateRecapRequest): Promise<void> {
  await apiSend("PUT", `/me/gates/${gate}/recap`, request);
}

/** Gates to book, record or re-run for the manager's engineers (also the menu badge). */
export const managerGatesQuery = queryOptions({
  queryKey: gateKeys.list,
  queryFn: () => apiGet("/manager/gates", gateListResponse),
});

export const gateFormQuery = (id: string, gate: number) =>
  queryOptions({
    queryKey: gateKeys.form(id, gate),
    queryFn: () => apiGet(`/manager/engineers/${id}/gates/${gate}`, gateFormResponse),
  });

export async function saveGate(id: string, gate: number, request: SaveGateRequest): Promise<void> {
  await apiSend("PUT", `/manager/engineers/${id}/gates/${gate}`, request);
}
