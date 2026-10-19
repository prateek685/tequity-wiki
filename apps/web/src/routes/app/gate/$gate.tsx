import { gateParam } from "@portal/contracts";
import { createFileRoute } from "@tanstack/react-router";
import { myGateQuery } from "@/features/gates/queries";
import { GatePlayer } from "@/features/learning/player/gate";
import { courseQuery } from "@/features/learning/queries";
import { LearningRouteError } from "@/features/learning/route-error";
import { pageTitle } from "@/lib/title";

/** Gate `$gate` (1) in the course player frame: after the Week 4 assessment. */
export const Route = createFileRoute("/app/gate/$gate")({
  params: {
    parse: (params: { gate: string }): { gate: number } => ({ gate: gateParam.parse(params).gate }),
    stringify: (params: { gate: number }) => ({ gate: String(params.gate) }),
  },
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.query(myGateQuery(params.gate)),
      context.queryClient.prefetchQuery(courseQuery),
    ]);
  },
  head: ({ params }) => pageTitle(`Gate ${params.gate}`),
  errorComponent: LearningRouteError,
  component: function GatePage() {
    const { gate } = Route.useParams();
    return <GatePlayer gate={gate} />;
  },
});
