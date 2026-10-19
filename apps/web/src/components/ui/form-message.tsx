import { cn } from "@/lib/cn";

/** Inline result of a form action. Neutral for success (green is reserved for Done / Passed). */
export function FormMessage({
  ok,
  message,
  className,
}: {
  ok: boolean;
  message: string;
  className?: string;
}) {
  if (!message) return null;
  return (
    <p role={ok ? "status" : "alert"} className={cn("text-xs", ok ? "text-fg-2" : "text-danger", className)}>
      {message}
    </p>
  );
}
