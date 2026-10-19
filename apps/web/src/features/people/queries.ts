import { listMyEngineersResponse, myEnrollmentResponse } from "@portal/contracts";
import { queryOptions } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

export const myEnrollmentQuery = queryOptions({
  queryKey: ["me", "enrollment"],
  queryFn: () => apiGet("/me/enrollment", myEnrollmentResponse),
});

export const myEngineersQuery = (page: number) =>
  queryOptions({
    queryKey: ["manager", "engineers", page],
    queryFn: () => apiGet(`/manager/engineers?page=${page}`, listMyEngineersResponse),
  });
