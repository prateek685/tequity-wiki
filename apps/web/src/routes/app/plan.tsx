import {
  type CheckinSummary,
  type CourseOutlineResponse,
  type GateSummary,
  type MyPlanResponse,
  type PlanDay,
} from "@portal/contracts";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, ShieldCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Notice, PageHeader } from "@/components/ui/page-header";
import { FINAL_STATUS_LABEL } from "@/features/final-review/final-review";
import { GateStatusBadge } from "@/features/gates/gate-result";
import { engineerStatusLabel, planGateDetail } from "@/features/gates/gates";
import { RoundBadge } from "@/features/gates/round-badge";
import { assessmentAfter, assessmentOpen } from "@/features/learning/assessment";
import { AssessmentBadge } from "@/features/learning/assessment-badge";
import { DayLink } from "@/features/learning/day-link";
import { DayStatusBadge } from "@/features/learning/day-status-badge";
import {
  type Checkpoint,
  checkpointsAfter,
  daysDone,
  LAST_DAY,
  lockMessage,
  PHASES,
} from "@/features/learning/plan";
import { courseQuery, myPlanQuery } from "@/features/learning/queries";
import { RagBadge } from "@/features/manager/rag-badge";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { pageTitle } from "@/lib/title";

/** Days 1–65 by phase, with the checkpoints between them (docs/PORTAL_PLAN.md §2, §9). */
export const Route = createFileRoute("/app/plan")({
  head: () => pageTitle("My plan"),
  loader: ({ context }) => context.queryClient.query(myPlanQuery),
  component: function MyPlanPage() {
    const { data: plan } = useSuspenseQuery(myPlanQuery);
    // Assessment states come from the course outline (rows show them once it loads).
    const course = useQuery(courseQuery);
    // The reason is shown once, on the first locked day: later days are locked behind it.
    const firstLocked = plan.days.find((day) => day.status === "locked")?.day;
    const target = plan.pace?.targetDate ?? plan.enrollment?.targetDate;
    return (
      <>
        <PageHeader
          title="My plan"
          description={
            <span className="tabular-nums">
              {LAST_DAY} lessons. {daysDone(plan.days)} done.
              {target ? ` Finish by ${formatDate(target)}.` : ""} Each day opens when the one before it is
              done.
            </span>
          }
        />
        {!plan.enrollment ? (
          <Notice tone="info">
            Your admin hasn&apos;t set your start date yet. You&apos;ll see Day 1 once it&apos;s set.
          </Notice>
        ) : null}
        {plan.days.length === 0 ? (
          <Notice>The lessons aren&apos;t available yet.</Notice>
        ) : (
          <Card>
            {PHASES.map(({ phase, name, first, last }) => (
              <section key={phase} aria-labelledby={`phase-${phase}`}>
                <div className="flex items-center justify-between gap-3 border-b border-line bg-subtle px-4 py-2.5 text-sm">
                  <h2 id={`phase-${phase}`} className="text-sm font-semibold">
                    Phase {phase} · {name}
                  </h2>
                  <span className="font-semibold text-muted tabular-nums">
                    Days {first}–{last}
                  </span>
                </div>
                <ol>
                  {plan.days
                    .filter((day) => day.day >= first && day.day <= last)
                    .flatMap((day) => [
                      <PlanRow
                        key={day.day}
                        day={day}
                        current={day.day === plan.currentDay}
                        showReason={day.day === firstLocked}
                        startDate={plan.enrollment?.startDate}
                      />,
                      ...checkpointsAfter(day.day, plan.enrollment).map((checkpoint) => (
                        <CheckpointRow
                          key={`${day.day}-${checkpoint.kind}`}
                          checkpoint={checkpoint}
                          day={day.day}
                          course={course.data}
                          checkin={
                            checkpoint.kind === "checkin"
                              ? plan.checkins.find((checkin) => checkin.afterDay === day.day)
                              : undefined
                          }
                          gate={
                            checkpoint.kind === "gate"
                              ? plan.gates.find((gate) => gate.afterDay === day.day)
                              : undefined
                          }
                          finalReview={checkpoint.kind === "final" ? plan.finalReview : null}
                        />
                      )),
                    ])}
                </ol>
              </section>
            ))}
          </Card>
        )}
      </>
    );
  },
});

function StatusPill({ day, current }: { day: PlanDay; current: boolean }) {
  if (day.status === "locked" && day.type === "live_call") return <Badge tone="info">Live call</Badge>;
  return <DayStatusBadge status={day.status} current={current} />;
}

function PlanRow({
  day,
  current,
  showReason,
  startDate,
}: {
  day: PlanDay;
  current: boolean;
  showReason: boolean;
  startDate?: string;
}) {
  const canOpen = day.status === "open" || day.status === "done";
  return (
    <li
      aria-current={current ? "step" : undefined}
      className={cn("plan-row border-b border-line px-4 py-2 text-sm", current && "bg-accent-50")}
    >
      <span className={cn("font-medium tabular-nums", current ? "text-accent-text" : "text-muted")}>
        Day {day.day}
      </span>
      <span className="min-w-0">
        {canOpen ? (
          <DayLink
            day={day.day}
            className="text-fg underline-offset-2 hover:text-accent-text hover:underline"
          >
            {day.title}
          </DayLink>
        ) : (
          <span>{day.title}</span>
        )}
        <RoundBadge round={day.round} className="ml-2" />
        {showReason ? (
          <span className="block text-xs text-muted">{lockMessage(day.lockReason, day.day, startDate)}</span>
        ) : null}
      </span>
      <span>
        <StatusPill day={day} current={current} />
      </span>
      <span className="plan-score text-right text-muted tabular-nums" />
    </li>
  );
}

const CHECKPOINT_ICON = {
  assessment: FileText,
  checkin: Users,
  gate: ShieldCheck,
  final: ShieldCheck,
} as const;

function CheckpointRow({
  checkpoint,
  day,
  course,
  checkin,
  gate,
  finalReview = null,
}: {
  checkpoint: Checkpoint;
  day: number;
  course: CourseOutlineResponse | undefined;
  /** The recorded check-in, for a check-in row. */
  checkin?: CheckinSummary;
  /** The gate's status, for a gate row (from M5; Gate 2 arrives in M6). */
  gate?: GateSummary;
  /** The final review's status, for the final review row (null before Day 65 is imported). */
  finalReview?: MyPlanResponse["finalReview"];
}) {
  const Icon = CHECKPOINT_ICON[checkpoint.kind];
  const isGate = checkpoint.kind === "gate" || checkpoint.kind === "final";
  const assessment = checkpoint.kind === "assessment" ? assessmentAfter(course, day) : null;
  const open = assessment !== null && assessmentOpen(assessment, course?.unlockAll ?? false);
  return (
    <li
      className={cn(
        "flex items-center gap-2.5 border-b border-line px-4 py-2 text-xs sm:pl-23",
        isGate ? "bg-warning-soft text-warning" : "bg-surface text-fg-2",
      )}
    >
      <Icon aria-hidden="true" className={cn("size-3.5 shrink-0", isGate ? "text-warning" : "text-info")} />
      <span className="min-w-0 flex-1">
        {open ? (
          <Link
            to="/app/assessment/$day"
            params={{ day }}
            className="text-fg underline-offset-2 hover:text-accent-text hover:underline"
          >
            {checkpoint.title}
          </Link>
        ) : finalReview ? (
          <Link
            to="/app/final-review"
            className="text-fg underline-offset-2 hover:text-accent-text hover:underline"
          >
            {checkpoint.title}
          </Link>
        ) : gate ? (
          <Link
            to="/app/gate/$gate"
            params={{ gate: gate.gate }}
            className="text-fg underline-offset-2 hover:text-accent-text hover:underline"
          >
            {checkpoint.title}
          </Link>
        ) : checkpoint.kind === "checkin" ? (
          <Link
            to="/app/checkin/$day"
            params={{ day }}
            className="text-fg underline-offset-2 hover:text-accent-text hover:underline"
          >
            {checkpoint.title}
          </Link>
        ) : (
          checkpoint.title
        )}{" "}
        ·{" "}
        {checkin
          ? `Held ${formatDate(checkin.heldOn)}`
          : gate
            ? planGateDetail(gate.status, gate.afterDay)
            : checkpoint.detail}
        {checkin?.note ? <span className="block text-fg-2">“{checkin.note}”</span> : null}
      </span>
      {assessment ? <AssessmentBadge status={assessment.status} /> : null}
      {checkin ? <RagBadge rag={checkin.rag} short /> : null}
      {finalReview && finalReview.status !== "locked" ? (
        <Badge tone={finalReview.status === "recorded" ? "success" : "accent"}>
          {FINAL_STATUS_LABEL[finalReview.status].engineer}
        </Badge>
      ) : null}
      {gate && gate.status !== "locked" ? (
        <GateStatusBadge status={gate.status} label={engineerStatusLabel(gate.status)} />
      ) : null}
    </li>
  );
}
