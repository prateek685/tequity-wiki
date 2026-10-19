import { type TeamEngineer, type TeamResponse } from "@portal/contracts";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Flag } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Kpi } from "@/components/ui/kpi";
import { Notice, PageHeader } from "@/components/ui/page-header";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { FinalOutcomeBadge } from "@/features/final-review/final-review";
import {
  averagePaceText,
  dayText,
  firstName,
  greeting,
  needsYou,
  paceText,
  pillarCells,
  TASK_PILL,
} from "@/features/manager/manager";
import { teamQuery } from "@/features/manager/queries";
import { RagBadge } from "@/features/manager/rag-badge";
import { TaskLink } from "@/features/manager/task-link";
import { UnlockPanel } from "@/features/manager/unlock-panel";
import { flagLine, redFlagsSub } from "@/features/red-flags/red-flags";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { pageTitle } from "@/lib/title";

/** The manager's Team page (docs/design/final-mockup.html `team()`, docs/PORTAL_PLAN.md §9 "Manager"). */
export const Route = createFileRoute("/manager/")({
  head: () => pageTitle("Team"),
  component: function TeamPage() {
    const { me } = Route.useRouteContext();
    const team = useQuery(teamQuery);
    const [hour] = useState(() => new Date().getHours());
    return (
      <>
        <PageHeader
          eyebrow={team.data ? teamLabel(team.data) : "My team"}
          title={`${greeting(hour)}, ${firstName(me.name)}`}
          description="Completion, scores and scorecards. Private notes and daily answers are not shown."
          greeting
        />
        {team.isPending ? (
          <p role="status" className="text-sm text-muted">
            Loading your team…
          </p>
        ) : team.isError ? (
          <Notice tone="warning">{errorMessage(team.error)}</Notice>
        ) : (
          <TeamView data={team.data} />
        )}
      </>
    );
  },
});

/** "Platform team", or the team names when the manager has several. */
function teamLabel(data: TeamResponse): string {
  const names = [...new Set(data.engineers.map((engineer) => engineer.teamName))];
  if (names.length === 0) return "My team";
  return names.length === 1 ? `${names[0]} team` : names.join(" · ");
}

function TeamView({ data }: { data: TeamResponse }) {
  const needs = needsYou(data.kpis);
  const [unlocking, setUnlocking] = useState<TeamEngineer | null>(null);
  const [done, setDone] = useState("");
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Engineers" value={data.kpis.engineers} sub={`${data.kpis.onTrack} on track`} />
        <Kpi label="Needs you" value={needs.value} sub={needs.sub} />
        <Link
          to="/manager/red-flags"
          aria-label={`Red flags: ${data.kpis.redFlags} open`}
          className="group rounded-card"
        >
          <Kpi
            label="Red flags"
            value={data.kpis.redFlags}
            tone={data.kpis.redFlags > 0 ? "danger" : "default"}
            sub={redFlagsSub(data.kpis.redFlags)}
            className="h-full group-hover:border-line-strong"
          />
        </Link>
        <Kpi
          label="Average pace"
          value={averagePaceText(data.kpis.averagePace)}
          sub="against 90-day targets"
        />
      </div>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-8">
          <CardHeader title="Engineers" aside="Pillars U · C · O · S from the latest scorecard" />
          {done ? (
            <p role="status" className="border-b border-line bg-subtle px-4 py-2.5 text-sm text-fg-2">
              {done}
            </p>
          ) : null}
          {data.engineers.length === 0 ? (
            <CardBody>
              <p className="text-sm text-muted">No engineers on your teams yet. An admin assigns teams.</p>
            </CardBody>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Engineer</Th>
                  <Th>Day</Th>
                  <Th>Pace</Th>
                  <Th>Pillars</Th>
                  <Th>Status</Th>
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {data.engineers.map((engineer) => (
                  <EngineerRow
                    key={engineer.id}
                    engineer={engineer}
                    onUnlock={() => {
                      setDone("");
                      setUnlocking(engineer);
                    }}
                  />
                ))}
              </tbody>
            </Table>
          )}
          {unlocking?.unlock ? (
            <UnlockPanel
              key={unlocking.id}
              engineer={unlocking}
              option={unlocking.unlock}
              onClose={() => {
                setUnlocking(null);
              }}
              onDone={(message) => {
                setUnlocking(null);
                setDone(message);
              }}
            />
          ) : null}
        </Card>
        <Card className="lg:col-span-4">
          <CardHeader title="This week" aside="Gates, reviews and check-ins" />
          {data.tasks.length === 0 ? (
            <CardBody>
              <p className="text-sm text-muted">Nothing waiting for you this week.</p>
            </CardBody>
          ) : (
            <ul>
              {data.tasks.map((task) => {
                const pill = TASK_PILL[task.status];
                return (
                  <li key={task.href} className="border-b border-line last:border-b-0">
                    <TaskLink
                      href={task.href}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-subtle"
                    >
                      <span className="min-w-0">
                        <b className="block text-sm font-medium">{task.title}</b>
                        <small className="block text-xs text-muted">{task.detail}</small>
                      </span>
                      <Badge tone={pill.tone} dot={pill.dot}>
                        {pill.label}
                      </Badge>
                    </TaskLink>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function EngineerRow({ engineer, onUnlock }: { engineer: TeamEngineer; onUnlock: () => void }) {
  return (
    <Tr>
      <Td label="Engineer" lead>
        <span className="flex items-center gap-2.5">
          <Avatar name={engineer.name} />
          <span className="min-w-0">
            <Link
              to="/manager/engineers/$id"
              params={{ id: engineer.id }}
              className="font-medium text-fg underline-offset-2 hover:text-accent-text hover:underline"
            >
              {engineer.name}
            </Link>
            {engineer.next ? (
              <span className="block text-xs font-normal text-muted">{engineer.next}</span>
            ) : null}
            {engineer.finalOutcome ? (
              <span className="mt-0.5 block">
                <FinalOutcomeBadge outcome={engineer.finalOutcome} />
              </span>
            ) : null}
            {engineer.flags.map((kind) => (
              <span key={kind} className="flex items-start gap-1 text-xs font-normal text-danger">
                <Flag aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
                <span className="sr-only">Red flag: </span>
                {flagLine(kind)}
              </span>
            ))}
          </span>
        </span>
      </Td>
      <Td label="Day" className="whitespace-nowrap tabular-nums">
        {dayText(engineer)}
      </Td>
      <Td label="Pace" className="text-sm whitespace-nowrap">
        {paceText(engineer.pace)}
      </Td>
      <Td label="Pillars" className="whitespace-nowrap tabular-nums">
        <span>
          <span className="sr-only">Understand, Communicate, Own, Stand firm: </span>
          {pillarCells(engineer.pillars).map((cell, index) => (
            <span key={cell.pillar}>
              {index > 0 ? <span className="text-muted"> · </span> : null}
              <span className={cn(cell.low && "font-medium text-danger")}>{cell.text}</span>
            </span>
          ))}
        </span>
      </Td>
      <Td label="Status">
        <RagBadge rag={engineer.rag} />
      </Td>
      <Td label="Unlock" className={cn("text-right", !engineer.unlock && "max-md:hidden")}>
        {engineer.unlock ? (
          <Button
            size="sm"
            onClick={onUnlock}
            aria-label={`Unlock: ${engineer.unlock.label} for ${engineer.name}`}
          >
            Unlock
          </Button>
        ) : null}
      </Td>
    </Tr>
  );
}
