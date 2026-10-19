import { cn } from "@/lib/cn";
import type * as React from "react";

export function Card({ className, ...props }: React.ComponentProps<"section">) {
  return (
    <section
      data-slot="card"
      className={cn(
        "min-w-0 overflow-hidden rounded-card border border-line bg-surface shadow-card",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  aside,
  className,
}: {
  title: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      data-slot="card-header"
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3",
        className,
      )}
    >
      <h2 className="text-md">{title}</h2>
      {aside ? <div className="flex items-center gap-2 text-sm text-muted">{aside}</div> : null}
    </header>
  );
}

export function CardBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-body" className={cn("flex flex-col gap-4 p-4", className)} {...props} />;
}
