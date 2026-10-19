import { Label as LabelPrimitive } from "radix-ui";
import { cn } from "@/lib/cn";
import type * as React from "react";

export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn("text-sm font-medium text-fg-2 select-none", className)}
      {...props}
    />
  );
}
