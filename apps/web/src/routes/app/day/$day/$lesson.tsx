import { dayParam, lessonId } from "@portal/contracts";
import { createFileRoute } from "@tanstack/react-router";
import { Player } from "@/features/learning/player/player";
import { QUIZ_ID, QUIZ_TITLE } from "@/features/learning/player-nav";
import { courseQuery, dayQuery } from "@/features/learning/queries";
import { LearningRouteError } from "@/features/learning/route-error";
import { pageTitle } from "@/lib/title";

/** The course player on one lesson; `$lesson` is a lesson id or "quiz" (the daily quiz). */
export const Route = createFileRoute("/app/day/$day/$lesson")({
  params: {
    parse: (params: { day: string; lesson: string }) => ({
      day: dayParam.parse(params).day,
      lesson: lessonId.parse(params.lesson),
    }),
    stringify: (params: { day: number; lesson: string }) => ({
      day: String(params.day),
      lesson: params.lesson,
    }),
  },
  loader: async ({ context, params }) => {
    const [data] = await Promise.all([
      context.queryClient.query(dayQuery(params.day)),
      context.queryClient.prefetchQuery(courseQuery),
    ]);
    const lesson = data.lessons.find((entry) => entry.id === params.lesson);
    return { title: params.lesson === QUIZ_ID ? QUIZ_TITLE : lesson?.title };
  },
  head: ({ params, loaderData }) =>
    pageTitle(loaderData?.title ? `Day ${params.day} · ${loaderData.title}` : `Day ${params.day}`),
  errorComponent: LearningRouteError,
  component: function LessonPage() {
    const { day, lesson } = Route.useParams();
    return <Player day={day} item={lesson} />;
  },
});
