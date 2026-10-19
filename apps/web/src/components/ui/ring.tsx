import type * as React from "react";

const SIZE = 148;
const STROKE = 10;
const RADIUS = (SIZE - STROKE - 4) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * A progress ring (accent on a subtle track) with content in the middle. The arc length is an SVG
 * attribute computed from the data, so no inline style is needed.
 */
export function Ring({
  value,
  max,
  label,
  children,
}: {
  value: number;
  max: number;
  /** Accessible name, e.g. "1 of 65 days done". */
  label: string;
  children: React.ReactNode;
}) {
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const arc = Math.max(CIRCUMFERENCE * share, 4);
  const centre = SIZE / 2;
  return (
    <div className="relative mx-auto size-37">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={label}>
        <circle
          cx={centre}
          cy={centre}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          className="stroke-subtle"
        />
        <circle
          cx={centre}
          cy={centre}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${CIRCUMFERENCE}`}
          transform={`rotate(-90 ${centre} ${centre})`}
          className="stroke-accent"
        />
      </svg>
      <div aria-hidden="true" className="absolute inset-0 grid place-items-center text-center">
        <div>{children}</div>
      </div>
    </div>
  );
}
