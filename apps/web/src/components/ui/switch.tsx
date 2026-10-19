import { Switch as SwitchPrimitive } from "radix-ui";
import { cn } from "@/lib/cn";
import type * as React from "react";

/** On/off switch (Radix Switch: a real button with role="switch" and aria-checked). */
export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-line-strong bg-subtle p-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-60 state-checked:border-accent state-checked:bg-accent",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-3.5 rounded-full bg-surface shadow-card transition-transform state-checked:translate-x-4" />
    </SwitchPrimitive.Root>
  );
}
