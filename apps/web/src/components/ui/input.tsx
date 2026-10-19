import { cn } from "@/lib/cn";
import type * as React from "react";

/** The one style for text-like controls (inputs, select triggers). */
export const controlClass =
  "w-full rounded-ctl border border-line-strong bg-surface px-2.5 py-2 text-base text-fg placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input data-slot="input" className={cn(controlClass, className)} {...props} />;
}
