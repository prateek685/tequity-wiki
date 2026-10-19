import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/shell/admin-shell";
import { AppShell } from "@/components/shell/app-shell";
import { requireArea } from "@/features/auth/session";

/** Admin area: /admin/*. People pages sit at the wiki level; the course's settings keep the course frame. */
export const Route = createFileRoute("/admin")({
  beforeLoad: async ({ context, location }) => ({
    me: await requireArea(context.queryClient, "admin", location.href),
  }),
  component: function AdminLayout() {
    const { me } = Route.useRouteContext();
    const matchRoute = useMatchRoute();
    if (matchRoute({ to: "/admin/settings" }))
      return (
        <AppShell user={me} role="admin">
          <Outlet />
        </AppShell>
      );
    return (
      <AdminShell user={me}>
        <Outlet />
      </AdminShell>
    );
  },
});
