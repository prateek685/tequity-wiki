import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { ErrorScreen, NotFoundScreen } from "./components/shell/status-screens";
import { ApiError } from "./lib/api";
import { routeTree } from "./routeTree.gen";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      // Don't retry client errors (401/403/404/validation); retry network and server errors once.
      retry: (failureCount, error) =>
        failureCount < 1 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
    },
  },
});

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  // Loaders read through the query cache, so the router itself caches nothing.
  defaultPreloadStaleTime: 0,
  defaultErrorComponent: ErrorScreen,
  defaultNotFoundComponent: NotFoundScreen,
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
