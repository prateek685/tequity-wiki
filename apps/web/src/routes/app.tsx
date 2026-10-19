import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/shell/app-shell";
import { engineerNav } from "@/components/shell/nav";
import { requireArea } from "@/features/auth/session";
import { currentAssessmentDay } from "@/features/learning/assessment";
import { courseQuery, myPlanQuery } from "@/features/learning/queries";

/** Engineer area: /app/*. */
export const Route = createFileRoute("/app")({
  beforeLoad: async ({ context, location }) => ({
    me: await requireArea(context.queryClient, "app", location.href),
  }),
  component: function EngineerLayout() {
    const { me } = Route.useRouteContext();
    // The menu's "Today" item follows the plan; it simply doesn't show while the plan loads or fails.
    const plan = useQuery(myPlanQuery);
    // "Assessment" opens the current or next weekly assessment, from the course outline.
    const course = useQuery(courseQuery);
    // The course player (/app/day/…, /app/assessment/…, /app/gate/…, /app/final-review) is full screen, without the app's sidebar and tab bar.
    const matchRoute = useMatchRoute();
    if (
      matchRoute({ to: "/app/day/$day", fuzzy: true }) ||
      matchRoute({ to: "/app/assessment/$day", fuzzy: true }) ||
      matchRoute({ to: "/app/gate/$gate", fuzzy: true }) ||
      matchRoute({ to: "/app/final-review" })
    )
      return <Outlet />;
    return (
      <AppShell
        user={me}
        role="engineer"
        items={engineerNav(plan.data?.currentDay ?? null, currentAssessmentDay(course.data))}
      >
        <Outlet />
      </AppShell>
    );
  },
});
