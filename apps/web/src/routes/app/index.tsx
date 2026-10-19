import {
  type DayViewResponse,
  type HomeResponse,
  type MyPlanResponse,
  type PlanDay,
} from "@portal/contracts";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowRight, Lock } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { MeterBar } from "@/components/ui/meter-bar";
import { Notice, PageHeader } from "@/components/ui/page-header";
import { Ring } from "@/components/ui/ring";
import { type StepMark, StepIcon } from "@/components/ui/step-icon";
import { assessmentAfter, assessmentOpen } from "@/features/learning/assessment";
import { AssessmentBadge } from "@/features/learning/assessment-badge";
import { DayLink } from "@/features/learning/day-link";
import { DayStatusBadge } from "@/features/learning/day-status-badge";
import { appHref, baselineRows } from "@/features/learning/home";
import {
  blockDays,
  blockLabel,
  type Checkpoint,
  checkInDetail,
  checkpointsAfter,
  daysDone,
  greeting,
  LAST_DAY,
  lockMessage,
  nextCheckInDay,
  NOT_READY_MESSAGE,
  paceLabel,
  pauseDays,
  phaseLabel,
} from "@/features/learning/plan";
import { dayItems, itemDone, itemLocked, type PlayerItem, startItem } from "@/features/learning/player-nav";
import { courseQuery, dayQuery, homeQuery, myPlanQuery } from "@/features/learning/queries";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { pageTitle } from "@/lib/title";
import type * as React from "react";

function firstName(name: string): string {
  return name.split(/[\s@]/)[0] ?? name;
}

/** The engineer's dashboard (docs/PORTAL_PLAN.md §8b "Engineer Home dashboard"). */
export const Route = createFileRoute("/app/")({
  head: () => pageTitle("Home"),
  loader: ({ context }) => context.queryClient.query(myPlanQuery),
  component: function EngineerHome() {
    const { me } = Route.useRouteContext();
    const { data: plan } = useSuspenseQuery(myPlanQuery);
    const focus = focusDay(plan);
    const current = plan.currentDay;
    // Today's steps and their states come from the current day (only when one is open).
    const today = useQuery({ ...dayQuery(current ?? 1), enabled: current !== null });
    const home = useQuery(homeQuery);
    // Read once on arrival (render must stay pure); the greeting doesn't need to tick.
    const [now] = useState(() => new Date());
    const greet = `${greeting(now)}, ${firstName(me.name)}`;

    if (!plan.enrollment) {
      return (
        <>
          <PageHeader greeting eyebrow="Client-Ready Engineer" title={greet} />
          <Notice tone="info">
            Your admin hasn&apos;t set your start date yet. You&apos;ll see Day 1 once it&apos;s set.
          </Notice>
        </>
      );
    }

    return (
      <>
        <HomeHeader plan={plan} focus={focus} title={greet} today={today.data} />
        {plan.days.length === 0 ? (
          <Notice>Your lessons aren&apos;t available yet.</Notice>
        ) : (
          <div className="grid gap-4 lg:grid-cols-12">
            <TodaySteps plan={plan} focus={focus} today={today} />
            <PaceCard plan={plan} enrollment={plan.enrollment} />
            <BlockCard plan={plan} focus={focus} />
            <BaselineCard home={home} />
            <FeedbackCard home={home} />
            <ComingUp plan={plan} focus={focus} />
          </div>
        )}
      </>
    );
  },
});

/** The day to show on Home: the current day, else the first day not done (locked or not ready). */
function focusDay(plan: MyPlanResponse): PlanDay | undefined {
  if (plan.currentDay !== null) return plan.days.find((day) => day.day === plan.currentDay);
  return plan.days.find((day) => day.status !== "done");
}

function started(today: DayViewResponse | undefined): boolean {
  if (!today) return false;
  return today.progress.some((state) => state.done) || today.quiz.status !== "locked";
}

function HomeHeader({
  plan,
  focus,
  title,
  today,
}: {
  plan: MyPlanResponse;
  focus: PlanDay | undefined;
  title: string;
  today: DayViewResponse | undefined;
}) {
  const open = focus !== undefined && focus.day === plan.currentDay;
  let description: React.ReactNode = "All 65 days are done.";
  if (focus && open)
    description = (
      <>
        Today: <b className="font-semibold text-fg-2">{focus.title}</b>. Lessons in order, the daily quiz
        last.
      </>
    );
  else if (focus)
    description =
      focus.status === "not_ready"
        ? `Next: ${focus.title}. ${NOT_READY_MESSAGE}`
        : lockMessage(focus.lockReason, focus.day, plan.enrollment?.startDate);
  return (
    <PageHeader
      greeting
      eyebrow={focus ? `Day ${focus.day} of ${LAST_DAY} · ${phaseLabel(focus.day)}` : "Client-Ready Engineer"}
      title={title}
      description={description}
      actions={
        focus && open ? (
          <DayLink day={focus.day} button>
            {started(today) ? "Continue" : "Start"} Day {focus.day}
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </DayLink>
        ) : null
      }
    />
  );
}

function LockedPill() {
  return (
    <Badge>
      <Lock aria-hidden="true" className="size-3" />
      Locked
    </Badge>
  );
}

function itemMark(today: DayViewResponse, item: PlayerItem, next: string | null): StepMark {
  if (itemDone(today, item.id)) return "done";
  if (!today.unlockAll && itemLocked(today, item.id)) return "locked";
  return item.id === next ? "next" : "todo";
}

function LessonRow({ today, item, next }: { today: DayViewResponse; item: PlayerItem; next: string | null }) {
  const mark = itemMark(today, item, next);
  return (
    <li className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
      <StepIcon mark={mark} />
      <div className="min-w-0 flex-1">
        {mark === "locked" ? (
          <span className="block font-medium">{item.title}</span>
        ) : (
          <DayLink
            day={today.day}
            lesson={item.id}
            className="block font-medium text-fg underline-offset-2 hover:text-accent-text hover:underline"
          >
            {item.title}
          </DayLink>
        )}
        <span className="mt-0.5 block truncate text-xs text-muted">{item.meta}</span>
      </div>
      {mark === "done" ? (
        <Badge tone="success" dot>
          Done
        </Badge>
      ) : mark === "locked" ? (
        <LockedPill />
      ) : mark === "next" ? (
        <Badge tone="accent">Up next</Badge>
      ) : null}
    </li>
  );
}

function TodaySteps({
  plan,
  focus,
  today,
}: {
  plan: MyPlanResponse;
  focus: PlanDay | undefined;
  today: ReturnType<typeof useQuery<DayViewResponse>>;
}) {
  const data = today.data;
  const lessonDone = data ? data.lessons.filter((lesson) => itemDone(data, lesson.id)).length : 0;
  return (
    <Card className="lg:col-span-8">
      <CardHeader
        title="Today's lessons"
        aside={
          data ? (
            <span className="tabular-nums">
              {lessonDone} of {data.lessons.length} done · quiz{" "}
              {data.quiz.status === "done" ? "done" : "last"}
            </span>
          ) : null
        }
      />
      {plan.currentDay === null ? (
        <CardBody>
          <p className="text-sm text-muted">
            {!focus
              ? "All 65 days are done."
              : focus.status === "not_ready"
                ? NOT_READY_MESSAGE
                : lockMessage(focus.lockReason, focus.day, plan.enrollment?.startDate)}
          </p>
        </CardBody>
      ) : today.isPending ? (
        <CardBody>
          <p role="status" className="text-sm text-muted">
            Loading today&apos;s lessons…
          </p>
        </CardBody>
      ) : today.isError ? (
        <CardBody>
          <Notice tone="warning">{errorMessage(today.error)}</Notice>
        </CardBody>
      ) : (
        <ol>
          {dayItems(today.data).map((item) => (
            <LessonRow key={item.id} today={today.data} item={item} next={startItem(today.data)} />
          ))}
        </ol>
      )}
    </Card>
  );
}

function PaceCard({
  plan,
  enrollment,
}: {
  plan: MyPlanResponse;
  enrollment: NonNullable<MyPlanResponse["enrollment"]>;
}) {
  const done = plan.pace?.daysDone ?? daysDone(plan.days);
  const pace = plan.pace;
  const target = pace?.targetDate ?? enrollment.targetDate;
  const rows: [string, string][] = [
    ["Finish by", formatDate(target)],
    ["Started", formatDate(enrollment.startDate)],
    ["Pause days", String(pauseDays(enrollment.startDate, target))],
    ["Gates passed", "0 / 3"],
  ];
  return (
    <Card className="lg:col-span-4">
      <CardHeader
        title="Your progress"
        aside={
          pace ? (
            <Badge tone={pace.status === "behind" ? "warning" : "neutral"} dot>
              {paceLabel(pace)}
            </Badge>
          ) : null
        }
      />
      <CardBody className="gap-3">
        <Ring value={done} max={LAST_DAY} label={`${done} of ${LAST_DAY} days done`}>
          <b className="block text-2xl leading-none font-semibold tabular-nums">{done}</b>
          <span className="text-xs text-muted">of {LAST_DAY} days</span>
        </Ring>
        <dl className="flex flex-col gap-2 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4">
              <dt className="text-muted">{label}</dt>
              <dd className="tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <Link to="/app/progress" className={buttonVariants({ size: "sm", className: "self-start" })}>
          See your progress
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      </CardBody>
    </Card>
  );
}

function tileClass(day: PlanDay, currentDay: number | null): string {
  if (day.day === currentDay) return "border-accent bg-accent text-on-accent";
  if (day.status === "done") return "border-transparent bg-success-soft text-success";
  return "border-line text-muted";
}

function DayTile({ day, currentDay }: { day: PlanDay; currentDay: number | null }) {
  const className = cn(
    "flex flex-col items-center gap-1 rounded-ctl border py-2 text-xs",
    tileClass(day, currentDay),
  );
  const state = day.day === currentDay ? "today" : day.status === "done" ? "done" : "not open yet";
  const content = (
    <>
      Day
      <b className="text-base font-medium tabular-nums">{day.day}</b>
      <span className="sr-only">, {state}</span>
    </>
  );
  if (day.status === "open" || day.status === "done")
    return (
      <li className="contents">
        <DayLink day={day.day} className={cn(className, "hover:opacity-90")}>
          {content}
        </DayLink>
      </li>
    );
  return <li className={className}>{content}</li>;
}

const CHECKPOINT_TITLE: Record<Checkpoint["kind"], string> = {
  assessment: "Assessment + scorecard",
  checkin: "Check-in with your manager",
  gate: "Gate",
  final: "Final review",
};

function CheckpointRow({
  title,
  detail,
  pill,
  link,
}: {
  title: string;
  detail: string;
  pill: React.ReactNode;
  /** The assessment's day, when it can be opened. */
  link?: number;
}) {
  return (
    <li className="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        {link ? (
          <Link
            to="/app/assessment/$day"
            params={{ day: link }}
            className="block font-medium text-fg underline-offset-2 hover:text-accent-text hover:underline"
          >
            {title}
          </Link>
        ) : (
          <b className="block font-medium">{title}</b>
        )}
        <span className="block text-xs text-muted">{detail}</span>
      </div>
      {pill}
    </li>
  );
}

function BlockCard({ plan, focus }: { plan: MyPlanResponse; focus: PlanDay | undefined }) {
  // The assessment's state comes from the course outline (shown once it loads).
  const course = useQuery(courseQuery);
  const anchor = focus ?? plan.days.at(-1);
  if (!anchor) return null;
  const { first, last } = blockDays(anchor.blockNumber);
  const days = plan.days.filter((day) => day.day >= first && day.day <= last);
  const checkpoints = checkpointsAfter(last, plan.enrollment);
  const assessment = assessmentAfter(course.data, last);
  const unlockAll = course.data?.unlockAll ?? false;
  const checkIn = nextCheckInDay(first);
  const laterCheckIn = checkIn !== null && checkIn > last ? checkIn : null;
  return (
    <Card className="lg:col-span-6 xl:col-span-4">
      <CardHeader title="This block" aside={blockLabel(anchor.blockNumber)} />
      <CardBody className="gap-3">
        <ol className="grid grid-cols-5 gap-1.5">
          {days.map((day) => (
            <DayTile key={day.day} day={day} currentDay={plan.currentDay} />
          ))}
        </ol>
        {checkpoints.length > 0 || laterCheckIn !== null ? (
          <ul>
            {checkpoints.map((checkpoint) => (
              <CheckpointRow
                key={checkpoint.kind}
                title={checkpoint.kind === "gate" ? checkpoint.title : CHECKPOINT_TITLE[checkpoint.kind]}
                detail={`After Day ${last} · ${checkpoint.detail}`}
                link={
                  checkpoint.kind === "assessment" && assessment && assessmentOpen(assessment, unlockAll)
                    ? last
                    : undefined
                }
                pill={
                  checkpoint.kind === "gate" ? (
                    <Badge tone="warning">Gate</Badge>
                  ) : checkpoint.kind === "assessment" && assessment ? (
                    <AssessmentBadge status={assessment.status} />
                  ) : (
                    <Badge tone="info">Checkpoint</Badge>
                  )
                }
              />
            ))}
            {laterCheckIn !== null ? (
              <CheckpointRow
                title={CHECKPOINT_TITLE.checkin}
                detail={`After Day ${laterCheckIn} · ${checkInDetail(laterCheckIn, plan.enrollment)}`}
                pill={<Badge>Later</Badge>}
              />
            ) : null}
          </ul>
        ) : null}
      </CardBody>
    </Card>
  );
}

type HomeState = ReturnType<typeof useQuery<HomeResponse>>;

/** Loading / error for a Home card whose data comes from /me/home. */
function HomeCardState({ home, loading }: { home: HomeState; loading: string }) {
  if (home.isPending)
    return (
      <p role="status" className="text-sm text-muted">
        {loading}
      </p>
    );
  if (home.isError) return <Notice tone="warning">{errorMessage(home.error)}</Notice>;
  return null;
}

/** Day-1 baseline per pillar (mockup `home()` "Day-1 baseline"). */
function BaselineCard({ home }: { home: HomeState }) {
  const baseline = home.data?.baseline;
  return (
    <Card className="lg:col-span-6 xl:col-span-4">
      <CardHeader title="Day-1 baseline" aside="1–5 per pillar" />
      <CardBody className="gap-3">
        {!home.data ? (
          <HomeCardState home={home} loading="Loading your baseline…" />
        ) : !baseline ? (
          <p className="text-sm text-muted">Your baseline appears after Day 1&apos;s self-rating.</p>
        ) : (
          <>
            <ul className="flex flex-col gap-2.5">
              {baselineRows(baseline).map((row) => (
                <li key={row.pillar} className="flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0">
                    {row.name}
                    <span className="sr-only">: {row.value} of 5</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <MeterBar percent={row.percent} />
                  </span>
                  <span aria-hidden="true" className="w-8 shrink-0 text-right tabular-nums">
                    {row.value}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">You&apos;ll compare against this on Day 65.</p>
          </>
        )}
      </CardBody>
    </Card>
  );
}

/** Latest feedback: mock logs, quiz and assessment results, AI scores of write tasks (newest first). */
function FeedbackCard({ home }: { home: HomeState }) {
  const router = useRouter();
  const items = home.data?.feedback ?? [];
  return (
    <Card className="lg:col-span-12 xl:col-span-4">
      <CardHeader
        title="Latest feedback"
        aside={
          <Link to="/app/progress" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            All
          </Link>
        }
      />
      {!home.data || items.length === 0 ? (
        <CardBody>
          {home.data ? (
            <p className="text-sm text-muted">Feedback from your mock logs and AI scores will show here.</p>
          ) : (
            <HomeCardState home={home} loading="Loading your feedback…" />
          )}
        </CardBody>
      ) : (
        <ul>
          {items.map((item) => {
            const href = appHref(item.href);
            return (
              <li key={`${item.kind}-${item.at}`} className="border-b border-line last:border-b-0">
                <a
                  href={href}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-subtle"
                  onClick={(event) => {
                    // A plain click stays in the app; modified clicks (new tab) use the href.
                    if (
                      event.button !== 0 ||
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    )
                      return;
                    event.preventDefault();
                    void router.navigate({ href });
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <b className="block font-medium">{item.title}</b>
                    <span className="mt-0.5 block truncate text-xs text-muted">{item.detail}</span>
                  </span>
                  <span className="shrink-0 text-sm font-medium tabular-nums">
                    {item.value ?? (
                      <>
                        <span aria-hidden="true" className="text-muted">
                          —
                        </span>
                        <span className="sr-only">Being scored</span>
                      </>
                    )}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function ComingUp({ plan, focus }: { plan: MyPlanResponse; focus: PlanDay | undefined }) {
  const next = focus ? plan.days.filter((day) => day.day > focus.day).slice(0, 3) : [];
  return (
    <Card className="lg:col-span-12">
      <CardHeader
        title="Coming up"
        aside={
          <Link to="/app/plan" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Full plan
          </Link>
        }
      />
      <CardBody>
        {next.length === 0 ? (
          <p className="text-sm text-muted">Nothing left after this day. The final review comes last.</p>
        ) : (
          // On phones the row scrolls sideways; a scroll region needs keyboard focus (WCAG 2.1.1, axe).
          // eslint-disable-next-line jsx-a11y-x/no-noninteractive-tabindex
          <ul className="card-row" tabIndex={0} aria-label="Next days">
            {next.map((day) => (
              <li key={day.day} className="flex flex-col gap-2 rounded-card border border-line p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-muted tabular-nums">Day {day.day}</span>
                  {day.status === "locked" ? <LockedPill /> : <DayStatusBadge status={day.status} />}
                </div>
                <h3>{day.title}</h3>
                <span className="text-xs text-muted">
                  {blockLabel(day.blockNumber)} · {phaseLabel(day.day)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
