import { type AssessmentStatus } from "@portal/contracts";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { ASSESSMENT_STATUS_LABEL } from "./assessment";

const TONE: Record<AssessmentStatus, BadgeProps["tone"]> = {
  locked: "neutral",
  not_ready: "neutral",
  ready: "accent",
  in_progress: "accent",
  passed: "success",
  failed: "warning",
};

/** The weekly assessment's state as a pill (green only for Passed). */
export function AssessmentBadge({ status }: { status: AssessmentStatus }) {
  return (
    <Badge tone={TONE[status]} dot={status === "passed"}>
      {ASSESSMENT_STATUS_LABEL[status]}
    </Badge>
  );
}
