import { libraryResponse } from "@portal/contracts";
import { queryOptions } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

/** The Library: frameworks, templates, AI prompts, glossary, resources and the mock cards (content only). */
export const libraryQuery = queryOptions({
  queryKey: ["library"] as const,
  queryFn: () => apiGet("/library", libraryResponse),
  staleTime: 10 * 60_000,
});
