import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { cn } from "@/lib/cn";

const NOT_SCORED = "na";
const SCORES = ["1", "2", "3", "4", "5"] as const;

/**
 * A 1–5 self-score as one segmented control, with "n/a" for "didn't come up" (null) unless
 * `notScored` is false (the baseline rates every behaviour). Criteria that didn't come up are skipped
 * in averages (docs/PORTAL_PLAN.md §1 "Call rubric"). Radix RadioGroup: one tab stop, arrow keys.
 */
export function ScoreScale({
  labelId,
  value,
  onChange,
  disabled,
  notScored = true,
  large = false,
}: {
  /** id of the element naming this criterion. */
  labelId: string;
  /** undefined = not answered yet; null = didn't come up. */
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  /** Offer "n/a" (didn't come up). */
  notScored?: boolean;
  /** Course player size: 36 × 32px segments. */
  large?: boolean;
}) {
  const current = value === undefined ? "" : value === null ? NOT_SCORED : String(value);
  const itemClass = cn(
    "grid place-items-center border-r border-line bg-surface text-fg-2 tabular-nums last:border-r-0 hover:bg-subtle focus-visible:-outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 state-checked:bg-accent state-checked:font-semibold state-checked:text-on-accent",
    large ? "h-8 w-9 text-base" : "h-7 min-w-8 px-2 text-sm font-medium",
  );
  return (
    <RadioGroupPrimitive.Root
      aria-labelledby={labelId}
      orientation="horizontal"
      value={current}
      disabled={disabled}
      onValueChange={(next) => {
        onChange(next === NOT_SCORED ? null : Number(next));
      }}
      className="inline-flex shrink-0 overflow-hidden rounded-ctl border border-line-strong"
    >
      {SCORES.map((score) => (
        <RadioGroupPrimitive.Item
          key={score}
          value={score}
          aria-label={`${score} of 5`}
          className={itemClass}
        >
          {score}
        </RadioGroupPrimitive.Item>
      ))}
      {notScored ? (
        <RadioGroupPrimitive.Item
          value={NOT_SCORED}
          aria-label="Didn't come up"
          className={cn(itemClass, "text-xs text-muted")}
        >
          n/a
        </RadioGroupPrimitive.Item>
      ) : null}
    </RadioGroupPrimitive.Root>
  );
}
