import { createFileRoute } from "@tanstack/react-router";
import { myFinalReviewQuery } from "@/features/final-review/queries";
import { FinalReviewPlayer } from "@/features/learning/player/final-review";
import { courseQuery } from "@/features/learning/queries";
import { LearningRouteError } from "@/features/learning/route-error";
import { pageTitle } from "@/lib/title";

/** The final review in the course player frame: after Day 64 (the readiness case). */
export const Route = createFileRoute("/app/final-review")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.query(myFinalReviewQuery),
      context.queryClient.prefetchQuery(courseQuery),
    ]);
  },
  head: () => pageTitle("Final review"),
  errorComponent: LearningRouteError,
  component: FinalReviewPlayer,
});
