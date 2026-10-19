/**
 * A thin horizontal bar (mockup `bar()`): `percent` of the track filled with the accent. Drawn as SVG
 * so the width is an attribute (data), not an inline style. Decorative: show the number beside it.
 */
export function MeterBar({ percent }: { percent: number }) {
  const width = Math.min(100, Math.max(0, percent));
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 6"
      preserveAspectRatio="none"
      className="block h-1.5 w-full overflow-hidden rounded-full"
    >
      <rect width="100" height="6" className="fill-subtle" />
      {width > 0 ? <rect width={width} height="6" className="fill-accent" /> : null}
    </svg>
  );
}
