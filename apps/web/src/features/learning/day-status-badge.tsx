import { type DayStatus } from "@portal/contracts";
import { Badge } from "@/components/ui/badge";

export function DayStatusBadge({ status, current = false }: { status: DayStatus; current?: boolean }) {
  if (status === "done")
    return (
      <Badge tone="success" dot>
        Done
      </Badge>
    );
  if (status === "not_ready") return <Badge tone="info">Not available</Badge>;
  if (status === "locked") return <Badge>Locked</Badge>;
  return <Badge tone="accent">{current ? "Today" : "Open"}</Badge>;
}
