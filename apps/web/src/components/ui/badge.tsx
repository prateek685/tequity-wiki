import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import type * as React from "react";

/** Status pill. Green (success) is reserved for Done / Passed. */
const badgeVariants = cva(
  "inline-flex h-5.5 items-center gap-1.5 rounded-full border px-2 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-line bg-subtle text-fg-2",
        success: "border-transparent bg-success-soft text-success",
        warning: "border-transparent bg-warning-soft text-warning",
        danger: "border-transparent bg-danger-soft text-danger",
        info: "border-transparent bg-info-soft text-info",
        accent: "border-transparent bg-accent-50 text-accent-text",
      },
      dot: { true: "badge-dot" },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type BadgeProps = React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, dot, ...props }: BadgeProps) {
  return <span data-slot="badge" className={cn(badgeVariants({ tone, dot }), className)} {...props} />;
}
