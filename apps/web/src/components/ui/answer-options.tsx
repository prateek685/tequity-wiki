import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { cn } from "@/lib/cn";
import type * as React from "react";

const LETTERS = ["A", "B", "C", "D"] as const;

const optionClass =
  "flex w-full gap-2.5 rounded-ctl border border-line-strong bg-surface px-3.5 py-2.5 text-left text-base";

function Letter({ index }: { index: number }) {
  return (
    <span aria-hidden="true" className="w-4 shrink-0 pt-0.5 text-xs font-medium text-muted">
      {LETTERS[index]}
    </span>
  );
}

/**
 * Answer options A–D as full-width rows (Radix RadioGroup: one tab stop, arrow keys). The picked row
 * gets the accent edge; the answer is sent with a separate button.
 */
export function AnswerOptions({
  options,
  value,
  onValueChange,
  disabled,
  label,
}: {
  options: React.ReactNode[];
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <RadioGroupPrimitive.Root
      aria-label={label}
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      className="flex flex-col gap-2"
    >
      {options.map((option, index) => (
        <RadioGroupPrimitive.Item
          // Options are fixed for a question; their position is their identity.
          // eslint-disable-next-line @eslint-react/no-array-index-key
          key={index}
          value={String(index)}
          className={cn(
            optionClass,
            "cursor-pointer hover:border-accent disabled:cursor-not-allowed disabled:opacity-60 state-checked:border-accent state-checked:bg-accent-50",
          )}
        >
          <Letter index={index} />
          <span className="min-w-0 flex-1">{option}</span>
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}

/** An answered option: green when right, red when the wrong pick, plain otherwise; note underneath. */
export function AnsweredOption({
  index,
  tone,
  children,
  note,
  aside,
}: {
  index: number;
  tone: "right" | "wrong" | "plain";
  children: React.ReactNode;
  note?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <li
      className={cn(
        optionClass,
        tone === "right" && "border-success bg-success-soft",
        tone === "wrong" && "border-danger bg-danger-soft",
      )}
    >
      <Letter index={index} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <span className="min-w-0 flex-1">{children}</span>
          {aside}
        </div>
        {note ? <div className="text-sm text-muted">{note}</div> : null}
      </div>
    </li>
  );
}
