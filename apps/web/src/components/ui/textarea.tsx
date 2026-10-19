import { cn } from "@/lib/cn";
import { controlClass } from "./input";
import type * as React from "react";

/** Multi-line text control, same look as <Input>. Grows with the user (resize vertical only). */
export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(controlClass, "min-h-24 resize-y leading-relaxed", className)}
      {...props}
    />
  );
}
