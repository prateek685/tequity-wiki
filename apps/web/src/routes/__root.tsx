import { type QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Outlet } from "@tanstack/react-router";

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({ meta: [{ title: "Tequity.wiki" }] }),
  component: () => (
    <>
      <HeadContent />
      <Outlet />
    </>
  ),
});
