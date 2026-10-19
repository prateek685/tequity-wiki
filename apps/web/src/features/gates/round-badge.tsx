import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { roundBadge } from "./gates";

/** "Round 2" on a day reopened by a gate repeat; nothing in round 1. */
export function RoundBadge({ round, className }: { round: number; className?: string }) {
  const label = roundBadge(round);
  if (!label) return null;
  return (
    <Badge tone="info" className={cn("shrink-0", className)}>
      {label}
    </Badge>
  );
}
