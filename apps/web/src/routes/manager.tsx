import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/shell/app-shell";
import { managerNav } from "@/components/shell/nav";
import { requireArea } from "@/features/auth/session";
import { needsManager } from "@/features/gates/gates";
import { managerGatesQuery } from "@/features/gates/queries";
import { redFlagsQuery } from "@/features/red-flags/queries";

/** Manager area: /manager/*. */
export const Route = createFileRoute("/manager")({
  beforeLoad: async ({ context, location }) => ({
    me: await requireArea(context.queryClient, "manager", location.href),
  }),
  component: function ManagerLayout() {
    const { me } = Route.useRouteContext();
    // The "Gates" badge: gates to book, record or re-run.
    const gates = useQuery(managerGatesQuery);
    const gatesDue = gates.data?.gates.filter((gate) => needsManager(gate.status)).length ?? null;
    // The "Red flags" badge: open flags.
    const flags = useQuery(redFlagsQuery("open"));
    return (
      <AppShell user={me} role="manager" items={managerNav(gatesDue, flags.data?.open ?? null)}>
        <Outlet />
      </AppShell>
    );
  },
});
