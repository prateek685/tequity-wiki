import { ChevronDown } from "lucide-react";
import { Collapsible as CollapsiblePrimitive } from "radix-ui";
import { cn } from "@/lib/cn";
import type * as React from "react";

/**
 * A titled section that opens and closes (Radix Collapsible: a real button with aria-expanded).
 * Used for library entries, frameworks, and the admin-only card prompt.
 */
export function Collapsible({
  title,
  aside,
  defaultOpen = false,
  children,
  className,
}: {
  title: React.ReactNode;
  aside?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <CollapsiblePrimitive.Root
      defaultOpen={defaultOpen}
      className={cn("rounded-ctl border border-line bg-surface", className)}
    >
      <CollapsiblePrimitive.Trigger className="group flex w-full items-center gap-2 rounded-ctl px-3 py-2 text-left text-sm font-medium text-fg hover:bg-subtle">
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 text-muted transition-transform group-state-open:rotate-180"
        />
        <span className="min-w-0 flex-1">{title}</span>
        {aside ? <span className="shrink-0 text-xs font-normal text-muted">{aside}</span> : null}
      </CollapsiblePrimitive.Trigger>
      <CollapsiblePrimitive.Content className="border-t border-line px-3 py-3">
        {children}
      </CollapsiblePrimitive.Content>
    </CollapsiblePrimitive.Root>
  );
}
