import { cn } from "@/lib/cn";
import type * as React from "react";

/**
 * The save bar under a form (mockup `actionbar()`): a status line on the left, the actions on the
 * right. Sticky above the tab bar on phones (`.actionbar` in globals.css).
 */
export function ActionBar({
  status,
  children,
  className,
}: {
  status?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("actionbar", className)}>
      <span className="min-w-0 text-sm text-muted">{status}</span>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{children}</div>
    </div>
  );
}
