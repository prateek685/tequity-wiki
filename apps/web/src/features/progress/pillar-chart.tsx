import { type Pillar, PILLARS, type WeeklyScorecard } from "@portal/contracts";
import { cn } from "@/lib/cn";
import {
  axisWeeks,
  CHART,
  NARROW_WIDTH,
  chartScale,
  chartWeeks,
  PILLAR_NAMES,
  pillarSeries,
  scoreText,
  weekLabel,
} from "./progress";

/** Pillar colours (tokens; charts only). */
const TONE: Record<Pillar, { stroke: string; fill: string; key: string }> = {
  understand: { stroke: "stroke-pillar-und", fill: "fill-pillar-und", key: "bg-pillar-und" },
  communicate: { stroke: "stroke-pillar-com", fill: "fill-pillar-com", key: "bg-pillar-com" },
  own: { stroke: "stroke-pillar-own", fill: "fill-pillar-own", key: "bg-pillar-own" },
  stand_firm: { stroke: "stroke-pillar-sf", fill: "fill-pillar-sf", key: "bg-pillar-sf" },
};

export function PillarLegend() {
  return (
    <ul aria-hidden="true" className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-xs text-muted">
      {PILLARS.map((pillar) => (
        <li key={pillar} className="flex items-center gap-1.5">
          <i className={cn("inline-block h-0.5 w-2.5", TONE[pillar].key)} />
          {PILLAR_NAMES[pillar]}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <i className="inline-block size-2 rounded-full border border-muted" />
        Not rated that week
      </li>
    </ul>
  );
}

function ChartSvg({
  scorecards,
  weeks,
  width,
  className,
}: {
  scorecards: WeeklyScorecard[];
  weeks: number;
  width: number;
  className: string;
}) {
  const { x, y } = chartScale(weeks, width);
  const series = pillarSeries(scorecards, weeks, width);
  const shown = axisWeeks(weeks, width);
  return (
    <svg
      viewBox={`0 0 ${width} ${CHART.height}`}
      className={cn("h-auto w-full", className)}
      role="img"
      aria-label={`Pillar scores from ${scorecards.length} weekly ${scorecards.length === 1 ? "scorecard" : "scorecards"}, on a scale of 1 to 5. The values are in the table below.`}
    >
      {[1, 2, 3, 4, 5].map((score) => (
        <g key={score}>
          <line
            x1={CHART.left}
            x2={width - CHART.right}
            y1={y(score)}
            y2={y(score)}
            className="stroke-line"
          />
          <text
            x={CHART.left - 10}
            y={y(score) + 4}
            textAnchor="end"
            className="fill-muted text-xs tabular-nums"
          >
            {score}
          </text>
        </g>
      ))}
      {shown.map((week) => (
        <text
          key={week}
          x={x(week)}
          y={CHART.height - 6}
          textAnchor={week === 1 ? "start" : week === weeks ? "end" : "middle"}
          className="fill-muted text-xs tabular-nums"
        >
          {weekLabel(week)}
        </text>
      ))}
      {series.map(({ pillar, points, segments }) => (
        <g key={pillar}>
          {segments.map(({ from, to, dashed }) => (
            <line
              key={`${from.week}-${to.week}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              strokeWidth={1.8}
              strokeDasharray={dashed ? "4 3" : undefined}
              className={TONE[pillar].stroke}
            />
          ))}
          {points.map((point) => (
            <circle
              key={point.week}
              cx={point.x}
              cy={point.y}
              r={3.2}
              strokeWidth={1.6}
              className={cn(TONE[pillar].stroke, point.carried ? "fill-surface" : TONE[pillar].fill)}
            />
          ))}
        </g>
      ))}
    </svg>
  );
}

/**
 * Pillar scores per Friday scorecard (mockup "Pillars · scorecards"): x = weeks ("Days 1–5", "6–10" …),
 * y = 1–5, one line per pillar. A pillar not rated that week carries its last score forward: a hollow
 * point reached by a dashed segment. Phones get a narrower drawing; the values are also in a visually
 * hidden table.
 */
export function PillarChart({ scorecards }: { scorecards: WeeklyScorecard[] }) {
  const weeks = chartWeeks(scorecards);
  const ordered = [...scorecards].sort((a, b) => a.week - b.week);
  return (
    <>
      <ChartSvg scorecards={scorecards} weeks={weeks} width={CHART.width} className="hidden sm:block" />
      <ChartSvg scorecards={scorecards} weeks={weeks} width={NARROW_WIDTH} className="block sm:hidden" />
      <div className="sr-only">
        <table>
          <caption>Pillar scores by week (1–5). “carried” means not rated that week.</caption>
          <thead>
            <tr>
              <th scope="col">Week</th>
              {PILLARS.map((pillar) => (
                <th key={pillar} scope="col">
                  {PILLAR_NAMES[pillar]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordered.map((card) => (
              <tr key={card.week}>
                <th scope="row">{weekLabel(card.week).replace(/^(?!Days)/, "Days ")}</th>
                {PILLARS.map((pillar) => (
                  <td key={pillar}>
                    {scoreText(card.scores[pillar])}
                    {card.scores[pillar] !== null && !card.rated.includes(pillar) ? " (carried)" : ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
