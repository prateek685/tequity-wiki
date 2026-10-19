import {
  type CourseOutlineResponse,
  FOLLOW_UP_LABELS,
  FOLLOW_UP_TYPES,
  type FollowUpType,
  GATE_BARS,
  type GateNo,
  type GateResult,
  type GateViewResponse,
} from "@portal/contracts";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, CircleCheck, Info } from "lucide-react";
import { useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Notice } from "@/components/ui/page-header";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  CriteriaList,
  GateHistory,
  GateNumbers,
  GateOutcomeDetails,
  GateStatusBadge,
  LiveCallPlan,
  OutcomeBadge,
} from "@/features/gates/gate-result";
import {
  asGateNo,
  engineerStatusLabel,
  followUpOk,
  followUpText,
  formatDateTime,
  GATE_COPY,
  gateWeeksText,
  shownResult,
  recapOk,
  repeatWeeksSentence,
} from "@/features/gates/gates";
import { gateKeys, myGateQuery, saveRecap } from "@/features/gates/queries";
import { ApiError, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { assessmentWeek } from "../assessment";
import { courseQuery, learningKeys } from "../queries";
import { FactsTable, panelClass } from "./blocks";
import { CourseOutline } from "./outline";
import { articleClass, PlayerFrame } from "./player";
import type * as React from "react";

/**
 * Gates 1 and 2 in the course player (docs/PORTAL_PLAN.md §2–§3): a 45-minute live call with the manager
 * after Day 20 / Day 40, then the written follow-up here (Gate 1: the recap; Gate 2: the recap plus one
 * more piece). A gate follows its week's assessment, like the weekly assessment follows a week. A
 * checkpoint, not a story lesson: the CareBook voice stays light.
 */

/** Day 14's final question bank: the engineer brings it to the gate. */
const QUESTION_BANK = { day: 14, lesson: "final-bank" } as const;

export function GatePlayer({ gate }: { gate: number }) {
  const { data: view } = useSuspenseQuery(myGateQuery(gate));
  const course = useQuery(courseQuery);
  const week = course.data?.weeks.find((entry) => entry.gate?.gate === gate);
  const phase = course.data?.phases.find((entry) => entry.number === week?.phase);
  return (
    <PlayerFrame
      crumb={phase ? `Phase ${phase.number} · ${phase.name}` : undefined}
      day={view.afterDay}
      scrollKey={`gate/${gate}/${view.status}/${view.round}`}
      outline={(onNavigate) => <CourseOutline course={course} gateNo={gate} onNavigate={onNavigate} />}
    >
      <GateMain key={`${gate}/${view.round}`} view={view} titles={dayTitles(course.data)} />
    </PlayerFrame>
  );
}

/** Day number → title, from the course outline (for the repeat list). */
function dayTitles(course: CourseOutlineResponse | undefined): Map<number, string> {
  return new Map(course?.weeks.flatMap((week) => week.days.map((day) => [day.day, day.title] as const)));
}

function GateMain({ view, titles }: { view: GateViewResponse; titles: Map<number, string> }) {
  const { result, earlier } = shownResult(view);
  const title = `Gate ${view.gate}${view.round > 1 ? ` · round ${view.round}` : ""}`;
  return (
    <>
      <article aria-labelledby="gate-title" className={articleClass}>
        <div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted tabular-nums">
            <span>
              Gate {view.gate} · after Day {view.afterDay} · 45 min with your manager
            </span>
            <GateStatusBadge status={view.status} label={engineerStatusLabel(view.status)} />
          </p>
          <h1 id="gate-title" className="mt-1 text-title font-bold">
            {title}
          </h1>
        </div>
        <GateBody view={view} result={result} titles={titles} />
        <GateHistory history={earlier} />
      </article>
      <GateFooter view={view} />
    </>
  );
}

function GateBody({
  view,
  result,
  titles,
}: {
  view: GateViewResponse;
  result: GateResult | null;
  titles: Map<number, string>;
}) {
  // The recap card keeps one place in the tree whatever the status, so a status change after sending
  // (to_book → recap_sent) doesn't remount it and lose its "sent" message.
  return (
    <>
      <GateTop view={view} result={result} titles={titles} />
      {view.status === "locked" ? null : <RecapCard view={view} />}
    </>
  );
}

/** What sits above the recap card for each status. */
function GateTop({
  view,
  result,
  titles,
}: {
  view: GateViewResponse;
  result: GateResult | null;
  titles: Map<number, string>;
}) {
  switch (view.status) {
    case "locked":
      return (
        <>
          <About view={view} />
          <Notice tone="info">Opens once Day {view.afterDay} is done.</Notice>
          {view.unlockAll ? (
            <p className="text-sm text-muted">
              While the course is open for review, the gate doesn&apos;t block Day {view.afterDay + 1}.
            </p>
          ) : null}
        </>
      );
    case "to_book":
      return (
        <>
          <About view={view} />
          <Bring gate={asGateNo(view.gate)} />
        </>
      );
    case "rerun":
      return (
        <>
          <InfoNote>
            <b className="font-semibold">You&apos;ve finished the repeat.</b> Book Gate {view.gate} again with
            your manager. It works the same way as last time, with a new scenario.
          </InfoNote>
          <About view={view} />
          <Bring gate={asGateNo(view.gate)} />
        </>
      );
    case "recap_sent":
      return (
        <>
          <Notice tone="info">
            Waiting for your manager to record the result. You can still edit your recap until then.
          </Notice>
        </>
      );
    case "passed":
    case "passed_focus":
      return (
        <>
          <Passed view={view} />
          <ResultCard view={view} result={result} />
        </>
      );
    case "repeat":
      return (
        <>
          <ResultCard view={view} result={result} />
          <RepeatCard view={view} weeks={result?.repeatWeeks ?? []} titles={titles} />
        </>
      );
  }
}

function InfoNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-card bg-info-soft px-3.5 py-3 text-base">
      <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-info" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/** What the gate is and how it runs (portal-native wording, no section references). */
function About({ view }: { view: GateViewResponse }) {
  const gate = asGateNo(view.gate);
  const copy = GATE_COPY[gate];
  return (
    <>
      <p className="max-w-prose text-md text-fg-2">
        {copy.intro} Pass it and Day {view.afterDay + 1} opens.
      </p>
      <div className={panelClass}>
        <FactsTable
          rows={[
            { label: "Time", value: "45 minutes with your manager." },
            { label: "The scenario", value: copy.scenario },
            { label: "The call", value: copy.call },
            { label: "Afterwards", value: copy.afterwards },
            { label: "To pass", value: GATE_BARS[gate].text },
          ]}
        />
      </div>
      <InfoNote>
        <b className="font-semibold">Book it with your manager.</b> Pick a 45-minute slot that suits you both,
        soon after you finish Day {view.afterDay}.
      </InfoNote>
    </>
  );
}

function Bring({ gate }: { gate: GateNo }) {
  const linkClass = "text-accent-text underline underline-offset-2";
  return (
    <section aria-labelledby="bring-title" className={cn(panelClass, "flex flex-col gap-2")}>
      <h2 id="bring-title" className="text-lg">
        Bring
      </h2>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-base text-fg-2">
        <li>
          <Link to="/app/progress" className={linkClass}>
            Your Progress
          </Link>
          : your {gateWeeksText(gate)} scorecards.
        </li>
        {gate === 1 ? (
          <li>
            <Link to="/app/day/$day/$lesson" params={QUESTION_BANK} preload={false} className={linkClass}>
              Your question bank
            </Link>
            , from Day {QUESTION_BANK.day}.
          </li>
        ) : null}
      </ul>
    </section>
  );
}

/** The recap: written and edited until the result is recorded, then read-only. */
function RecapCard({ view }: { view: GateViewResponse }) {
  const id = useId();
  const queryClient = useQueryClient();
  const gate = asGateNo(view.gate);
  const recorded = view.result !== null;
  const [text, setText] = useState(view.recap?.text ?? "");
  /** Gate 2: the second written piece. */
  const [followUpType, setFollowUpType] = useState<FollowUpType | null>(view.recap?.followUpType ?? null);
  const [followUp, setFollowUp] = useState(view.recap?.followUpText ?? "");
  const [sent, setSent] = useState("");
  const save = useMutation({
    mutationFn: () =>
      saveRecap(
        view.gate,
        gate === 2 && followUpType ? { text, followUpType, followUpText: followUp } : { text },
      ),
    onSuccess: async () => {
      const what = gate === 2 ? "Follow-up" : "Recap";
      setSent(view.recap ? `${what} updated.` : `${what} sent. Your manager can read it now.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: gateKeys.mine(view.gate) }),
        queryClient.invalidateQueries({ queryKey: learningKeys.course }),
        queryClient.invalidateQueries({ queryKey: learningKeys.plan }),
      ]);
    },
  });
  const error = save.error instanceof ApiError ? save.error : null;
  const fields = error?.code === "VALIDATION" ? (error.body.fields ?? {}) : {};
  const followUpError = fields.followUpType ?? fields.followUpText;
  const fieldError =
    error?.code === "VALIDATION" ? (fields.text ?? (followUpError ? undefined : error.message)) : undefined;
  const cardTitle = gate === 2 ? "Your written follow-up" : "Your recap";
  if (recorded && !view.recap) return null;
  if (recorded && view.recap)
    return (
      <Card aria-labelledby={`${id}-title`}>
        <CardHeader
          title={<span id={`${id}-title`}>{cardTitle}</span>}
          aside={<span className="tabular-nums">Sent {formatDateTime(view.recap.submittedAt)}</span>}
        />
        <CardBody>
          {gate === 2 ? <h3 className="text-sm font-medium text-fg-2">Recap</h3> : null}
          <p className="text-base whitespace-pre-wrap text-fg-2">{view.recap.text}</p>
          {gate === 2 && view.recap.followUpType ? (
            <>
              <h3 className="text-sm font-medium text-fg-2">{FOLLOW_UP_LABELS[view.recap.followUpType]}</h3>
              <p className="text-base whitespace-pre-wrap text-fg-2">{view.recap.followUpText ?? ""}</p>
            </>
          ) : null}
        </CardBody>
      </Card>
    );
  const incomplete = !recapOk(text) || !followUpOk(gate, followUpType, followUp);
  const unchanged =
    view.recap !== null &&
    text.trim() === view.recap.text.trim() &&
    (gate === 1 ||
      (followUpType === view.recap.followUpType &&
        followUp.trim() === (view.recap.followUpText ?? "").trim()));
  return (
    <Card aria-labelledby={`${id}-title`}>
      <CardHeader
        title={<span id={`${id}-title`}>{cardTitle}</span>}
        aside={
          view.recap ? (
            <span className="tabular-nums">Sent {formatDateTime(view.recap.submittedAt)}</span>
          ) : (
            "After the call"
          )
        }
      />
      <form
        noValidate
        className="flex flex-col gap-3 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          setSent("");
          if (!incomplete) save.mutate();
        }}
      >
        <label htmlFor={`${id}-text`} className="text-sm font-medium text-fg-2">
          Recap of the call
        </label>
        <Textarea
          id={`${id}-text`}
          value={text}
          rows={8}
          maxLength={5000}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={`${id}-hint`}
          placeholder={"Bottom line: …\nDecisions: …\nNext steps: who does what, by when …"}
          onChange={(event) => {
            setSent("");
            setText(event.target.value);
          }}
        />
        {fieldError ? (
          <span id={`${id}-hint`} role="alert" className="text-xs text-danger">
            {fieldError}
          </span>
        ) : (
          <span id={`${id}-hint`} className="text-xs text-muted">
            {gate === 2
              ? "Bottom line first, decisions, owners and dates."
              : "Send it within 2 hours of the call: bottom line first, decisions, owners and dates."}
          </span>
        )}
        {gate === 2 ? (
          <>
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor={`${id}-type`} className="text-sm font-medium text-fg-2">
                Second piece
              </label>
              <Select
                value={followUpType ?? ""}
                onValueChange={(value) => {
                  setSent("");
                  setFollowUpType(value as FollowUpType);
                }}
              >
                <SelectTrigger id={`${id}-type`} aria-invalid={followUpError ? true : undefined}>
                  <SelectValue placeholder="Pick one" />
                </SelectTrigger>
                <SelectContent>
                  {FOLLOW_UP_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {FOLLOW_UP_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label htmlFor={`${id}-follow-up`} className="text-sm font-medium text-fg-2">
              {followUpType ? FOLLOW_UP_LABELS[followUpType] : "The second piece"}
            </label>
            <Textarea
              id={`${id}-follow-up`}
              value={followUp}
              rows={8}
              maxLength={5000}
              aria-invalid={followUpError ? true : undefined}
              aria-describedby={`${id}-follow-up-hint`}
              onChange={(event) => {
                setSent("");
                setFollowUp(event.target.value);
              }}
            />
            {followUpError ? (
              <span id={`${id}-follow-up-hint`} role="alert" className="text-xs text-danger">
                {followUpError}
              </span>
            ) : (
              <span id={`${id}-follow-up-hint`} className="text-xs text-muted">
                Both are required: {followUpText(followUpType).toLowerCase()}
                {followUpType
                  ? "."
                  : " plus a bad-news email, an escalation message or a weekly status report."}
              </span>
            )}
          </>
        ) : null}
        {error && !fieldError ? <Notice tone="danger">{errorMessage(error)}</Notice> : null}
        <div className="flex flex-wrap items-center justify-end gap-3">
          {sent ? (
            <span role="status" className="text-sm text-fg-2">
              {sent}
            </span>
          ) : null}
          <Button type="submit" variant="primary" disabled={incomplete || unchanged || save.isPending}>
            {save.isPending
              ? "Sending…"
              : view.recap
                ? gate === 2
                  ? "Update follow-up"
                  : "Update recap"
                : gate === 2
                  ? "Submit follow-up"
                  : "Submit recap"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ResultCard({ view, result }: { view: GateViewResponse; result: GateResult | null }) {
  if (!result) return null;
  const gate = asGateNo(view.gate);
  return (
    <Card aria-labelledby="result-title">
      <CardHeader
        title={<span id="result-title">Your result</span>}
        aside={<OutcomeBadge outcome={result.outcome} />}
      />
      <CardBody>
        <GateNumbers result={result} gate={gate} followUpType={view.recap?.followUpType} />
        <CriteriaList result={result} />
        <LiveCallPlan result={result} title="Your Phase 3 live calls" />
        <GateOutcomeDetails result={result} />
      </CardBody>
    </Card>
  );
}

function Passed({ view }: { view: GateViewResponse }) {
  return (
    <div role="status" className="flex items-center gap-4 rounded-card bg-success-soft px-4.5 py-4">
      <CircleCheck aria-hidden="true" className="size-6 shrink-0 text-success" />
      <span>
        <b className="block font-semibold">You passed Gate {view.gate}.</b>
        <span className="text-base text-fg-2">
          Day {view.afterDay + 1} is open.{" "}
          {view.result?.focusItems.length
            ? "Keep your focus items in mind for the next weeks' mock calls."
            : GATE_COPY[asGateNo(view.gate)].next}
        </span>
      </span>
    </div>
  );
}

function RepeatCard({
  view,
  weeks,
  titles,
}: {
  view: GateViewResponse;
  weeks: number[];
  titles: Map<number, string>;
}) {
  const done = view.repeatDays.filter((day) => day.done).length;
  return (
    <section aria-labelledby="repeat-title" className={cn(panelClass, "flex flex-col gap-3")}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="repeat-title" className="text-lg">
          Repeat {repeatWeeksSentence(weeks) || "2 focus blocks"}
        </h2>
        <span className="text-sm text-muted tabular-nums">
          {done} of {view.repeatDays.length} done
        </span>
      </div>
      <p className="max-w-prose text-base text-fg-2">
        No penalty — this is normal for some people. These days open again as round 2, and what you did the
        first time is kept. When they&apos;re done, Gate {view.gate} runs again with your manager.
      </p>
      <ul className="flex flex-col">
        {view.repeatDays.map((day) => (
          <li key={day.day} className="border-t border-line first:border-t-0">
            <Link
              to="/app/day/$day"
              params={{ day: day.day }}
              preload={false}
              className="flex items-center gap-3 rounded-ctl px-1 py-2 text-base hover:bg-subtle"
            >
              <span className="w-14 shrink-0 font-medium tabular-nums">Day {day.day}</span>
              <span className="min-w-0 flex-1 truncate text-fg-2">{titles.get(day.day) ?? ""}</span>
              {day.done ? (
                <Badge tone="success">
                  <Check aria-hidden="true" className="size-3" />
                  Done
                </Badge>
              ) : (
                <Badge>To do</Badge>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Previous (the Week 4 assessment) · "Gate 1 · after Day 20" · the next step. */
function GateFooter({ view }: { view: GateViewResponse }) {
  const nextRepeat = view.repeatDays.find((day) => !day.done);
  const passed = view.status === "passed" || view.status === "passed_focus";
  return (
    <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-line bg-bg px-4 py-3 lg:px-12 lg:py-3.5">
      <Link
        to="/app/assessment/$day"
        params={{ day: view.afterDay }}
        className={buttonVariants({ size: "lg", className: "shrink-0" })}
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        <span className="max-sm:sr-only">Previous</span>
      </Link>
      <span className="hidden min-w-0 truncate text-center text-sm text-muted tabular-nums md:block">
        Week {assessmentWeek(view.afterDay)} · Gate {view.gate}
      </span>
      {passed || view.unlockAll ? (
        <Link
          to="/app/day/$day"
          params={{ day: view.afterDay + 1 }}
          preload={false}
          className={buttonVariants({
            variant: passed ? "primary" : "secondary",
            size: "lg",
            className: "max-w-full",
          })}
        >
          <span className="truncate">Start Day {view.afterDay + 1}</span>
          <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
        </Link>
      ) : view.status === "repeat" && nextRepeat ? (
        <Link
          to="/app/day/$day"
          params={{ day: nextRepeat.day }}
          preload={false}
          className={buttonVariants({ variant: "primary", size: "lg", className: "max-w-full" })}
        >
          <span className="truncate">Go to Day {nextRepeat.day}</span>
          <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
        </Link>
      ) : (
        <Link to="/app/plan" className={buttonVariants({ size: "lg" })}>
          My plan
        </Link>
      )}
    </div>
  );
}
