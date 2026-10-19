import {
  CHECKIN_DAYS,
  type EngineerDetailResponse,
  GATE_AFTER_DAY,
  type GateNo,
  PILLARS,
} from "@portal/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Notice, PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { FINAL_STATUS_LABEL, FinalOutcomeBadge, LiveCallsCard } from "@/features/final-review/final-review";
import { finalReviewFormQuery } from "@/features/final-review/queries";
import { GateStatusBadge, OutcomeBadge } from "@/features/gates/gate-result";
import { averageText, formatDateTime } from "@/features/gates/gates";
import { gateFormQuery } from "@/features/gates/queries";
import { CHECKPOINT_TEXT, pillarValue } from "@/features/manager/manager";
import { engineerQuery } from "@/features/manager/queries";
import { RagBadge } from "@/features/manager/rag-badge";
import { UnlockPanel } from "@/features/manager/unlock-panel";
import { PILLAR_NAMES } from "@/features/progress/progress";
import { ProgressView } from "@/features/progress/progress-view";
import { errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import { pageTitle } from "@/lib/title";

/**
 * One engineer (docs/PORTAL_PLAN.md §9 "Engineer detail"): the Progress charts, the 13-week tracker
 * (PDF §5.5), check-ins and unlocks. Completion and scores only: nothing private.
 */
export const Route = createFileRoute("/manager/engineers/$id/")({
  head: () => pageTitle("Engineer"),
  component: function EngineerPage() {
    const { id } = Route.useParams();
    const detail = useQuery(engineerQuery(id));
    if (detail.isPending)
      return (
        <p role="status" className="text-sm text-muted">
          Loading…
        </p>
      );
    if (detail.isError)
      return (
        <>
          <PageHeader title="Engineer" />
          <Notice tone="warning">{errorMessage(detail.error)}</Notice>
          <BackToTeam />
        </>
      );
    return <EngineerView data={detail.data} />;
  },
});

function BackToTeam() {
  return (
    <div>
      <Link to="/manager" className={buttonVariants()}>
        Back to Team
      </Link>
    </div>
  );
}

function EngineerView({ data }: { data: EngineerDetailResponse }) {
  const { engineer } = data;
  const [unlocking, setUnlocking] = useState(false);
  const [done, setDone] = useState("");
  const facts = [
    engineer.teamName,
    engineer.startDate ? `Started ${formatDate(engineer.startDate)}` : "No start date",
    engineer.targetDate ? `Finish by ${formatDate(engineer.targetDate)}` : null,
  ].filter((fact) => fact !== null);
  return (
    <>
      <PageHeader
        title={engineer.name}
        description={<span className="tabular-nums">{facts.join(" · ")}</span>}
        actions={
          data.unlock ? (
            <Button
              onClick={() => {
                setDone("");
                setUnlocking(true);
              }}
            >
              Unlock
            </Button>
          ) : null
        }
      />
      {unlocking && data.unlock ? (
        <Card>
          <UnlockPanel
            engineer={engineer}
            option={data.unlock}
            onClose={() => {
              setUnlocking(false);
            }}
            onDone={(message) => {
              setUnlocking(false);
              setDone(message);
            }}
          />
        </Card>
      ) : null}
      {done ? (
        <p role="status" className="rounded-ctl border border-line bg-subtle px-3 py-2 text-sm text-fg-2">
          {done}
        </p>
      ) : null}
      <ProgressView data={data.progress} />
      <Tracker data={data} />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <GateCard id={engineer.id} gate={1} />
        <GateCard id={engineer.id} gate={2} />
      </div>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <FinalCard id={engineer.id} />
          <Checkins data={data} />
        </div>
        <div className="flex flex-col gap-4">
          <LiveCallsCard liveCalls={data.liveCalls} />
          <Unlocks data={data} />
        </div>
      </div>
    </>
  );
}

function Tracker({ data }: { data: EngineerDetailResponse }) {
  return (
    <Card>
      <CardHeader title="13-week tracker" aside="Days done · pillars U C O S · checkpoints" />
      <Table>
        <thead>
          <tr>
            <Th>Week</Th>
            <Th>Days done</Th>
            {PILLARS.map((pillar) => (
              <Th key={pillar} className="text-right">
                <abbr title={PILLAR_NAMES[pillar]} className="no-underline">
                  {PILLAR_NAMES[pillar][0]}
                </abbr>
              </Th>
            ))}
            <Th>Check-in / gate</Th>
            <Th>G/A/R</Th>
            <Th>Note</Th>
          </tr>
        </thead>
        <tbody>
          {data.tracker.map((week) => (
            <Tr key={week.week}>
              <Td label="Week" lead className="tabular-nums">
                Week {week.week}
              </Td>
              <Td label="Days done" className="tabular-nums">
                {week.daysDone}/5
              </Td>
              {PILLARS.map((pillar) => (
                <Td key={pillar} label={PILLAR_NAMES[pillar]} className="text-right tabular-nums">
                  {week.pillars ? pillarValue(week.pillars[pillar]) : <span className="text-muted">—</span>}
                </Td>
              ))}
              <Td label="Check-in / gate">
                {week.checkpoint ? CHECKPOINT_TEXT[week.checkpoint] : <span className="text-muted">—</span>}
              </Td>
              <Td label="G/A/R">
                <RagBadge rag={week.rag} short />
              </Td>
              <Td label="Note" className="text-fg-2">
                {week.note ?? <span className="text-muted">—</span>}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

function Checkins({ data }: { data: EngineerDetailResponse }) {
  const id = data.engineer.id;
  return (
    <Card>
      <CardHeader title="Check-ins" aside="After Days 10, 30, 50 and 60" />
      <ul>
        {CHECKIN_DAYS.map((day) => {
          const recorded = data.checkins.find((checkin) => checkin.afterDay === day);
          const due = data.checkinsDue.includes(day);
          return (
            <li
              key={day}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line px-4 py-2.5 last:border-b-0"
            >
              <span className="min-w-0 flex-1">
                <b className="block text-sm font-medium">After Day {day}</b>
                <small className="block text-xs text-muted">
                  {recorded
                    ? `Held ${formatDate(recorded.heldOn)} · ${recorded.note}`
                    : due
                      ? "Day done. Book it and record it here."
                      : "Opens once the engineer finishes this day."}
                </small>
              </span>
              {recorded ? (
                <span className="flex items-center gap-2">
                  <RagBadge rag={recorded.rag} short />
                  <Link
                    to="/manager/engineers/$id/checkins/$day"
                    params={{ id, day }}
                    className={buttonVariants({ size: "sm", variant: "ghost" })}
                    aria-label={`Edit the check-in after Day ${day}`}
                  >
                    Edit
                  </Link>
                </span>
              ) : due ? (
                <span className="flex items-center gap-2">
                  <Badge tone="warning" dot>
                    Due
                  </Badge>
                  <Link
                    to="/manager/engineers/$id/checkins/$day"
                    params={{ id, day }}
                    className={buttonVariants({ size: "sm", variant: "primary" })}
                  >
                    Record check-in
                  </Link>
                </span>
              ) : (
                <span className="text-xs text-muted">Not yet</span>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** A gate (1 or 2): status, the recorded result, and the form (docs/PORTAL_PLAN.md §2). */
function GateCard({ id, gate: gateNo }: { id: string; gate: GateNo }) {
  const gate = useQuery(gateFormQuery(id, gateNo));
  const afterDay = GATE_AFTER_DAY[gateNo];
  const result = gate.data?.saved?.result ?? null;
  const actionable = gate.data ? gate.data.reached : false;
  return (
    <Card>
      <CardHeader
        title={`Gate ${gateNo}`}
        aside={gate.data ? <GateStatusBadge status={gate.data.status} /> : `After Day ${afterDay}`}
      />
      <CardBody>
        {gate.isPending ? (
          <p role="status" className="text-sm text-muted">
            Loading…
          </p>
        ) : gate.isError ? (
          <p className="text-sm text-muted">{errorMessage(gate.error)}</p>
        ) : (
          <>
            <p className="text-sm text-fg-2">
              {result
                ? `Round ${result.round} · held ${formatDateTime(result.heldAt)}`
                : gate.data.reached
                  ? gate.data.recap
                    ? `Recap sent ${formatDateTime(gate.data.recap.submittedAt)}. Record the result.`
                    : `Day ${afterDay} done. The engineer books the 45-minute call with you.`
                  : `Opens once the engineer finishes Day ${afterDay}.`}
            </p>
            {result ? (
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <OutcomeBadge outcome={result.outcome} />
                <span className="text-muted tabular-nums">
                  Average {averageText(result.average)} · lowest {result.lowest ?? "—"}
                </span>
              </p>
            ) : null}
            <div>
              <Link
                to="/manager/engineers/$id/gates/$gate"
                params={{ id, gate: gateNo }}
                className={buttonVariants({
                  size: "sm",
                  variant: actionable && !result ? "primary" : "secondary",
                })}
              >
                {result ? `Open Gate ${gateNo}` : `Record Gate ${gateNo}`}
              </Link>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

/** The final review after Day 64: status, the decision, and the form. */
function FinalCard({ id }: { id: string }) {
  const form = useQuery(finalReviewFormQuery(id));
  const saved = form.data?.saved ?? null;
  return (
    <Card>
      <CardHeader
        title="Final review"
        aside={
          form.data ? (
            <Badge
              tone={
                form.data.status === "recorded"
                  ? "success"
                  : form.data.status === "to_book"
                    ? "accent"
                    : "neutral"
              }
            >
              {FINAL_STATUS_LABEL[form.data.status].manager}
            </Badge>
          ) : (
            "After Day 64"
          )
        }
      />
      <CardBody>
        {form.isPending ? (
          <p role="status" className="text-sm text-muted">
            Loading…
          </p>
        ) : form.isError ? (
          <p className="text-sm text-muted">{errorMessage(form.error)}</p>
        ) : (
          <>
            <p className="text-sm text-fg-2">
              {saved
                ? `Held ${formatDateTime(saved.heldAt)} · ${saved.call}`
                : form.data.reached
                  ? "Readiness case shared. The engineer books the review with you."
                  : "Opens once the engineer finishes Day 64 and shares their readiness case."}
            </p>
            {saved ? (
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <FinalOutcomeBadge outcome={saved.outcome} />
                <span className="text-muted tabular-nums">
                  Average {averageText(saved.average)} · lowest {saved.lowest ?? "—"}
                </span>
              </p>
            ) : null}
            <div>
              <Link
                to="/manager/engineers/$id/final-review"
                params={{ id }}
                className={buttonVariants({
                  size: "sm",
                  variant: form.data.reached && !saved ? "primary" : "secondary",
                })}
              >
                {saved ? "Open the final review" : "Record the final review"}
              </Link>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}

const WHEN = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

function Unlocks({ data }: { data: EngineerDetailResponse }) {
  return (
    <Card>
      <CardHeader title="Unlock history" />
      {data.unlocks.length === 0 ? (
        <CardBody>
          <p className="text-sm text-muted">No unlocks yet.</p>
        </CardBody>
      ) : (
        <ul>
          {data.unlocks.map((unlock) => (
            <li
              key={unlock.at}
              className="flex flex-col gap-0.5 border-b border-line px-4 py-2.5 last:border-b-0"
            >
              <span className="text-sm font-medium">
                {unlock.kind === "retake_now"
                  ? `Retake now · Week ${unlock.day / 5} assessment`
                  : `Opened Day ${unlock.day}`}
              </span>
              <span className="text-sm text-fg-2">“{unlock.reason}”</span>
              <span className="text-xs text-muted tabular-nums">
                {unlock.by.name} · {WHEN.format(new Date(unlock.at))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
