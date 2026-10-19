import { cn } from "@/lib/cn";
import type * as React from "react";

/**
 * Responsive table: a normal table on desktop, stacked label/value rows on phones (< 768px, see
 * `.rtable` in globals.css). Every <Td> gets a `label`, shown on phones in place of the header;
 * `stack` puts a form or list below its label on phones instead of beside it.
 */
export function Table({
  className,
  stacked = true,
  ...props
}: React.ComponentProps<"table"> & {
  /** False keeps a narrow table (2–3 short columns) as a table on phones too. */
  stacked?: boolean;
}) {
  return (
    <table
      data-slot="table"
      className={cn(stacked && "rtable", "w-full border-collapse text-sm", className)}
      {...props}
    />
  );
}

export function Th({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "border-b border-line bg-subtle px-4 py-2 text-left text-xs font-medium whitespace-nowrap text-muted",
        className,
      )}
      {...props}
    />
  );
}

export function Tr({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn("border-b border-line last:border-b-0", className)} {...props} />;
}

export function Td({
  label,
  lead = false,
  stack = false,
  className,
  ...props
}: React.ComponentProps<"td"> & { label: string; lead?: boolean; stack?: boolean }) {
  return (
    <td
      data-label={label}
      data-lead={lead ? "" : undefined}
      data-stack={stack ? "" : undefined}
      className={cn("px-4 py-2.5 align-middle", className)}
      {...props}
    />
  );
}
