import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import type * as React from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  greeting = false,
}: {
  eyebrow?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Dashboard greeting: the larger 28px title. */
  greeting?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 flex-col gap-1">
        {eyebrow ? (
          <span className="text-xs font-medium tracking-wider text-muted uppercase">{eyebrow}</span>
        ) : null}
        <h1 className={greeting ? "text-2xl tracking-tight" : "text-xl"}>{title}</h1>
        {description ? <p className="text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

const noticeVariants = cva("rounded-ctl border px-3 py-2 text-sm", {
  variants: {
    tone: {
      neutral: "border-line bg-subtle text-muted",
      success: "border-transparent bg-success-soft text-success",
      warning: "border-transparent bg-warning-soft text-warning",
      danger: "border-transparent bg-danger-soft text-danger",
      info: "border-transparent bg-info-soft text-info",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Notice({
  tone,
  className,
  children,
}: VariantProps<typeof noticeVariants> & { className?: string; children: React.ReactNode }) {
  return (
    <p role={tone === "danger" ? "alert" : undefined} className={cn(noticeVariants({ tone }), className)}>
      {children}
    </p>
  );
}
