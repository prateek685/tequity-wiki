import { createFileRoute, redirect } from "@tanstack/react-router";
import { dayRouteParams } from "@/features/learning/day-param";
import { Player } from "@/features/learning/player/player";
import { startItem } from "@/features/learning/player-nav";
import { courseQuery, dayQuery } from "@/features/learning/queries";
import { LearningRouteError } from "@/features/learning/route-error";
import { pageTitle } from "@/lib/title";

/** /app/day/N opens the player on the first lesson not done yet (old ?step= links land here too). */
export const Route = createFileRoute("/app/day/$day/")({
  params: dayRouteParams,
  loader: async ({ context, params }) => {
    const [data] = await Promise.all([
      context.queryClient.query(dayQuery(params.day)),
      context.queryClient.prefetchQuery(courseQuery),
    ]);
    const lesson = startItem(data);
    if (lesson)
      throw redirect({ to: "/app/day/$day/$lesson", params: { day: params.day, lesson }, replace: true });
  },
  head: ({ params }) => pageTitle(`Day ${params.day}`),
  errorComponent: LearningRouteError,
  // Only reached when the day has nothing to show yet (locked or not imported): the player says why.
  component: function DayStart() {
    const { day } = Route.useParams();
    return <Player day={day} item={null} />;
  },
});
