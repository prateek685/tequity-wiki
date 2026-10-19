import {
  finalReviewFormResponse,
  finalReviewListResponse,
  finalReviewViewResponse,
  type SaveFinalReviewRequest,
} from "@portal/contracts";
import { queryOptions } from "@tanstack/react-query";
import { apiGet, apiSend } from "@/lib/api";

/** Final review keys: the engineer's under ["me"], the manager's under ["manager"] (`managerKeys.all` covers them). */
export const finalReviewKeys = {
  mine: ["me", "final-review"] as const,
  list: ["manager", "final-reviews"] as const,
  form: (id: string) => ["manager", "engineer", id, "final-review"] as const,
};

/** The engineer's Final review page: status, live calls still "later", the result. */
export const myFinalReviewQuery = queryOptions({
  queryKey: finalReviewKeys.mine,
  queryFn: () => apiGet("/me/final-review", finalReviewViewResponse),
});

/** Final reviews to book or recorded for the manager's engineers (on the Gates page). */
export const managerFinalReviewsQuery = queryOptions({
  queryKey: finalReviewKeys.list,
  queryFn: () => apiGet("/manager/final-reviews", finalReviewListResponse),
});

export const finalReviewFormQuery = (id: string) =>
  queryOptions({
    queryKey: finalReviewKeys.form(id),
    queryFn: () => apiGet(`/manager/engineers/${id}/final-review`, finalReviewFormResponse),
  });

export async function saveFinalReview(id: string, request: SaveFinalReviewRequest): Promise<void> {
  await apiSend("PUT", `/manager/engineers/${id}/final-review`, request);
}
