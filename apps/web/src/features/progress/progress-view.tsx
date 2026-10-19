import { type ProgressResponse } from "@portal/contracts";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Kpi } from "@/components/ui/kpi";
import { MeterBar } from "@/components/ui/meter-bar";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { FinalOutcomeBadge } from "@/features/final-review/final-review";
import { averageText } from "@/features/gates/gates";
import { PillarDot } from "@/features/learning/player/blocks";
import { PillarChart, PillarLegend } from "./pillar-chart";
import {
  assessmentTile,
  dayOneRows,
  paceLine,
  RUBRIC_NAMES,
  rubricPercent,
  scoreText,
  writingTile,
} from "./progress";

/**
 * The progress charts and tiles (final mockup `progress()`): the engineer's own Progress page (`self`)
 * and the manager's engineer page render the same view. Scores and completion only, nothing private.
 */
export function ProgressView({ data, self = false }: { data: ProgressResponse; self?: boolean }) {
  const assessments = assessmentTile(data.assessments);
  const writing = writingTile(data.writing, self);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Days"
          value={
            <>
              {data.days.done} <small className="text-base font-normal text-muted">/ {data.days.total}</small>
            </>
          }
          sub={paceLine(data.days) || undefined}
        />
        <Kpi label="Assessments" value={assessments.value} sub={assessments.sub} />
        <Kpi
          label="Gate 1"
          value={data.gate1 ? data.gate1.average.toFixed(1) : "—"}
          sub={
            data.gate1
              ? `${data.gate1.passed ? "Pass" : "Not passed"} · lowest ${data.gate1.lowest}`
              : "After Day 20"
          }
        />
        <Kpi
          label="Writing"
          value={
            writing.value === null ? (
              "—"
            ) : (
              <>
                {writing.value} <small className="text-base font-normal text-muted">/ 5</small>
              </>
            )
          }
          sub={writing.sub}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Pillars · scorecards"
            aside={data.scorecards.length > 0 ? <PillarLegend /> : null}
          />
          <CardBody>
            {data.scorecards.length === 0 ? (
              <p className="text-sm text-muted">
                {self
                  ? "Your pillar chart starts with your first weekly scorecard, on Day 5."
                  : "The pillar chart starts with the first weekly scorecard, on Day 5."}
              </p>
            ) : (
              <PillarChart scorecards={data.scorecards} />
            )}
          </CardBody>
        </Card>
        <Card>
          {/* After Day 65 the final scorecard is the Day-90 column (PDF: compared per pillar). */}
          <CardHeader title={data.dayNinety ? "Day 1 → Day 90" : "Day 1 → now"} aside="per pillar" />
          <Table stacked={false}>
            <thead>
              <tr>
                <Th>Pillar</Th>
                <Th className="text-right">Day 1</Th>
                <Th className="text-right">{data.dayNinety ? "Day 90" : "Now"}</Th>
              </tr>
            </thead>
            <tbody>
              {dayOneRows(data.dayOne, data.dayNinety ?? data.now).map((row) => (
                <Tr key={row.pillar}>
                  <Td label="Pillar" lead>
                    <span className="flex items-center gap-2">
                      <PillarDot pillar={row.pillar} />
                      {row.name}
                    </span>
                  </Td>
                  <Td label="Day 1" className="text-right tabular-nums">
                    {row.dayOne}
                  </Td>
                  <Td
                    label={data.dayNinety ? "Day 90" : "Now"}
                    className="text-right font-medium tabular-nums"
                  >
                    {row.now}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          {data.dayOne === null ? (
            <p className="border-t border-line px-4 py-3 text-sm text-muted">
              {self
                ? "Day 1 fills in after your Day-1 self-rating."
                : "Day 1 fills in after the Day-1 self-rating."}
            </p>
          ) : null}
          {data.finalReview ? (
            <p className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 text-sm text-fg-2">
              Final review
              <FinalOutcomeBadge outcome={data.finalReview.outcome} />
              <span className="text-muted tabular-nums">average {averageText(data.finalReview.average)}</span>
            </p>
          ) : null}
        </Card>
      </div>
      <Card>
        <CardHeader
          title="Call rubric"
          aside={self ? "1–10 from your call logs · 11 from gates" : "1–10 from call logs · 11 from gates"}
        />
        <CardBody>
          <ul className="grid grid-cols-1 gap-x-8 gap-y-0.5 md:grid-cols-2">
            {data.rubric.map((row) => (
              <li key={row.criterion} className="rubric-row py-1.5 text-sm">
                <span className="min-w-0">
                  {row.criterion}. {RUBRIC_NAMES[row.criterion] ?? `Criterion ${row.criterion}`}
                  <span className="sr-only">
                    {row.average === null
                      ? ": no scores yet"
                      : `: average ${scoreText(row.average)} of 5 from ${row.count} ${row.count === 1 ? "score" : "scores"}`}
                  </span>
                </span>
                <MeterBar percent={rubricPercent(row.average)} />
                <span aria-hidden="true" className="text-right tabular-nums">
                  {row.average === null ? (
                    <span className="text-muted">—</span>
                  ) : (
                    <>
                      <b className="font-medium">{scoreText(row.average)}</b>
                      <span className="text-xs text-muted"> ({row.count})</span>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </>
  );
}
