import { type Area, AREA_BY_ROLE, homePathFor, type Me, meResponse } from "@portal/contracts";
import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";
import { ApiError, apiGet } from "@/lib/api";

/**
 * The signed-in user, or null when signed out. Kept fresh for 30 seconds: role changes reach the
 * screen quickly, and the API re-checks every request anyway (these guards are for navigation only).
 */
export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async (): Promise<Me | null> => {
    try {
      return await apiGet("/me", meResponse);
    } catch (error) {
      if (error instanceof ApiError && error.code === "UNAUTHENTICATED") return null;
      throw error;
    }
  },
  staleTime: 30_000,
});

/** Where a route guard should send this user, or null to let them in. Pure: unit-tested. */
export function guardTarget(me: Me | null, area: Area | "home", path: string): string | null {
  if (!me) return `/sign-in?next=${encodeURIComponent(path)}`;
  if (me.status !== "active" || me.role === null) return homePathFor(me);
  // The wiki home is open to every active user; each role area only to its own role.
  if (area === "home") return null;
  return AREA_BY_ROLE[me.role] === area ? null : "/forbidden";
}

/** `beforeLoad` for the wiki home and the three role areas: returns the signed-in user, or redirects. */
export async function requireArea(queryClient: QueryClient, area: Area | "home", path: string): Promise<Me> {
  const me = await queryClient.query(meQuery);
  const target = guardTarget(me, area, path);
  if (target !== null || me === null) throw redirect({ href: target ?? "/sign-in", replace: true });
  return me;
}
