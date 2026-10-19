import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export type StepMark = "done" | "todo" | "next" | "locked";

const MARK_LABEL: Record<StepMark, string> = {
  done: "Done",
  todo: "To do",
  next: "Up next",
  locked: "Locked",
};

/**
 * The square step check: green with a tick when done (green is reserved for Done), orange edge for
 * up next, dashed when locked. Carries a text label for screen readers.
 */
export function StepIcon({ mark, className }: { mark: StepMark; className?: string }) {
  return (
    <span
      role="img"
      aria-label={MARK_LABEL[mark]}
      className={cn(
        "grid size-4.5 shrink-0 place-items-center rounded-ctl border-2 border-line-strong text-on-accent",
        mark === "done" && "border-success bg-success",
        mark === "next" && "border-accent",
        mark === "locked" && "border-dashed",
        className,
      )}
    >
      {mark === "done" ? <Check aria-hidden="true" strokeWidth={3} className="size-3" /> : null}
    </span>
  );
}
