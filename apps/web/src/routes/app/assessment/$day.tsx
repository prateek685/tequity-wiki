import { assessmentParam } from "@portal/contracts";
import { createFileRoute } from "@tanstack/react-router";
import { assessmentWeek } from "@/features/learning/assessment";
import { AssessmentPlayer } from "@/features/learning/player/assessment";
import { assessmentQuery, courseQuery } from "@/features/learning/queries";
import { LearningRouteError } from "@/features/learning/route-error";
import { pageTitle } from "@/lib/title";

/** The weekly assessment after `$day` (5, 10 … 60), in the course player frame. */
export const Route = createFileRoute("/app/assessment/$day")({
  params: {
    parse: (params: { day: string }) => ({ day: assessmentParam.parse(params).day }),
    stringify: (params: { day: number }) => ({ day: String(params.day) }),
  },
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.query(assessmentQuery(params.day)),
      context.queryClient.prefetchQuery(courseQuery),
    ]);
  },
  head: ({ params }) => pageTitle(`Week ${assessmentWeek(params.day)} assessment`),
  errorComponent: LearningRouteError,
  component: function AssessmentPage() {
    const { day } = Route.useParams();
    return <AssessmentPlayer day={day} />;
  },
});
