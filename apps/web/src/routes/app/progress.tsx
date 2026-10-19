import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Notice, PageHeader } from "@/components/ui/page-header";
import { ProgressView } from "@/features/progress/progress-view";
import { progressQuery } from "@/features/progress/queries";
import { errorMessage } from "@/lib/api";
import { pageTitle } from "@/lib/title";

/** The engineer's Progress page (docs/design/final-mockup.html `progress()`, docs/PORTAL_PLAN.md §3). */
export const Route = createFileRoute("/app/progress")({
  head: () => pageTitle("Progress"),
  component: function ProgressPage() {
    const progress = useQuery(progressQuery);
    return (
      <>
        <PageHeader
          title="Progress"
          description="Your scores over the 90 days. There's no single overall grade."
        />
        {progress.isPending ? (
          <p role="status" className="text-sm text-muted">
            Loading your progress…
          </p>
        ) : progress.isError ? (
          <Notice tone="warning">{errorMessage(progress.error)}</Notice>
        ) : (
          <ProgressView data={progress.data} self />
        )}
      </>
    );
  },
});
