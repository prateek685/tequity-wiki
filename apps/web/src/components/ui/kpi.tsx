import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import { Card } from "./card";
import type * as React from "react";

const kpiValueVariants = cva("text-xl font-semibold tracking-tight tabular-nums", {
  variants: {
    tone: { default: "", danger: "text-danger" },
  },
  defaultVariants: { tone: "default" },
});

/** A KPI tile (mockup `kpi()`): label, a big number, one muted line. */
export function Kpi({
  label,
  value,
  sub,
  tone,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  className?: string;
} & VariantProps<typeof kpiValueVariants>) {
  return (
    <Card className={cn("flex flex-col gap-1 px-4 py-3", className)}>
      <span className="text-xs font-medium tracking-wider text-muted uppercase">{label}</span>
      <b className={kpiValueVariants({ tone })}>{value}</b>
      {sub ? <span className="text-xs text-muted">{sub}</span> : null}
    </Card>
  );
}
