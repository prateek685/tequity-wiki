import {
  type AssessmentResult,
  type AssessmentViewResponse,
  type CourseOutlineResponse,
  type QuizItem,
} from "@portal/contracts";
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, CircleCheck, Info, PenLine } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardHeader } from "@/components/ui/card";
import { Markdown } from "@/components/ui/markdown";
import { Notice } from "@/components/ui/page-header";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { assessmentScreen, retakeLabel, rulesRows } from "../assessment";
import { blockDays } from "../plan";
import { assessmentQuery, courseQuery, learningKeys, startAssessment } from "../queries";
import { QuizRunner } from "../quiz";
import { AiFeedback } from "./ai-feedback";
import { FactsTable, panelClass } from "./blocks";
import { CourseOutline } from "./outline";
import { articleClass, PlayerFrame } from "./player";
import type * as React from "react";

/**
 * The weekly assessment in the course player (docs/design/course-player.html, "Week 1 assessment"):
 * Before you start → one question at a time → the result. It follows the week's 5th day.
 */

type Course = CourseOutlineResponse | undefined;

export function AssessmentPlayer({ day }: { day: number }) {
  const { data: view } = useSuspenseQuery(assessmentQuery(day));
  const course = useQuery(courseQuery);
  const week = course.data?.weeks.find((entry) => entry.number === view.week);
  const phase = course.data?.phases.find((entry) => entry.number === week?.phase);
  const screen = assessmentScreen(view);
  return (
    <PlayerFrame
      crumb={phase ? `Phase ${phase.number} · ${phase.name}` : undefined}
      day={view.day}
      scrollKey={`assessment/${day}/${screen}`}
      outline={(onNavigate) => <CourseOutline course={course} assessmentDay={day} onNavigate={onNavigate} />}
    >
      <AssessmentMain key={`${day}/${view.attempt?.id ?? ""}`} view={view} course={course.data} />
    </PlayerFrame>
  );
}

function AssessmentMain({ view, course }: { view: AssessmentViewResponse; course: Course }) {
  switch (assessmentScreen(view)) {
    case "questions":
      return <Questions view={view} />;
    case "result":
      return <Result view={view} course={course} />;
    case "intro":
      return <Intro view={view} />;
    default:
      return <Unavailable view={view} course={course} />;
  }
}

function Heading({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div>
      <p className="text-sm text-muted tabular-nums">{kicker}</p>
      <h1 id="assessment-title" className="mt-1 text-title font-bold">
        {title}
      </h1>
    </div>
  );
}

/** Previous (the week's last quiz) · "Week N · Assessment" · the screen's action. */
function Footer({
  view,
  message,
  children,
}: {
  view: AssessmentViewResponse;
  message?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-line bg-bg px-4 py-3 lg:px-12 lg:py-3.5">
      <Link
        to="/app/day/$day/$lesson"
        params={{ day: view.day, lesson: "quiz" }}
        preload={false}
        className={buttonVariants({ size: "lg", className: "shrink-0" })}
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        <span className="max-sm:sr-only">Previous</span>
      </Link>
      <span className="hidden min-w-0 truncate text-center text-sm text-muted tabular-nums md:block">
        Week {view.week} · Assessment
      </span>
      <div className="flex min-w-0 flex-col items-end gap-1">
        {message ? <span className="text-right text-sm text-muted">{message}</span> : null}
        {children}
      </div>
    </div>
  );
}

function ReviewNote({ view }: { view: AssessmentViewResponse }) {
  if (!view.unlockAll) return null;
  return (
    <p className="text-sm text-muted">
      While the course is open for review, this assessment doesn&apos;t block Day {view.day + 1}.
    </p>
  );
}

function InfoNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-card bg-info-soft px-3.5 py-3 text-base">
      <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-info" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/** Start (or retake) the assessment: the answer replaces the cached view. */
function useStart(day: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => startAssessment(day),
    onSuccess: (view) => {
      queryClient.setQueryData(learningKeys.assessment(day), view);
      void queryClient.invalidateQueries({ queryKey: learningKeys.course });
    },
  });
}

// ── Locked / not ready ──────────────────────────────────────────────────────────────────────────

function Unavailable({ view, course }: { view: AssessmentViewResponse; course: Course }) {
  const { first, last } = blockDays(view.week);
  const days = course?.weeks.find((week) => week.number === view.week)?.days ?? [];
  const nextDay = days.find((day) => day.status !== "done" && day.lessons.length > 0);
  return (
    <>
      <article aria-labelledby="assessment-title" className={articleClass}>
        <Heading kicker={`Week ${view.week} · Assessment`} title={`Week ${view.week} assessment`} />
        <Notice tone="info">
          {view.status === "locked"
            ? `Finish Days ${first}–${last} first. The assessment comes after Day ${last}.`
            : "This assessment isn't available yet."}
        </Notice>
        <ReviewNote view={view} />
      </article>
      <Footer view={view}>
        {view.status === "locked" && nextDay ? (
          <Link
            to="/app/day/$day"
            params={{ day: nextDay.day }}
            preload={false}
            className={buttonVariants({ variant: "primary", size: "lg" })}
          >
            Go to Day {nextDay.day}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        ) : (
          <Link to="/app/plan" className={buttonVariants({ variant: "primary", size: "lg" })}>
            Go to My plan
          </Link>
        )}
      </Footer>
    </>
  );
}

// ── Before you start ────────────────────────────────────────────────────────────────────────────

function Intro({ view }: { view: AssessmentViewResponse }) {
  const start = useStart(view.day);
  const { first, last } = blockDays(view.week);
  return (
    <>
      <article aria-labelledby="assessment-title" className={articleClass}>
        <Heading
          kicker={`Week ${view.week} · Assessment · about 15 min`}
          title={`Week ${view.week} assessment`}
        />
        <p className="max-w-prose text-md text-fg-2">
          Before Day {view.day + 1} opens, show what you can do after this week. Every question is a moment
          from the CareBook story in Days {first}–{last}.
        </p>
        <div className={panelClass}>
          <FactsTable rows={rulesRows(view.rules)} />
        </div>
        <InfoNote>
          You can stop and come back: answered questions are saved. Answers can&apos;t be changed once
          submitted.
        </InfoNote>
        <ReviewNote view={view} />
      </article>
      <Footer
        view={view}
        message={
          start.isError ? (
            <span role="alert" className="text-danger">
              {errorMessage(start.error)}
            </span>
          ) : null
        }
      >
        <Button
          variant="primary"
          size="lg"
          disabled={start.isPending}
          onClick={() => {
            start.mutate();
          }}
        >
          {start.isPending
            ? "Starting…"
            : view.status === "in_progress"
              ? "Continue the assessment"
              : "Start the assessment"}
          {start.isPending ? null : <ArrowRight aria-hidden="true" className="size-4" />}
        </Button>
      </Footer>
    </>
  );
}

// ── Questions ───────────────────────────────────────────────────────────────────────────────────

/** The 10-segment strip: answered (green), current (accent), to do. */
export function ProgressStrip({ items, index }: { items: QuizItem[]; index: number }) {
  const answered = items.filter((item) => item.result !== null).length;
  return (
    <div role="img" aria-label={`${answered} of ${items.length} answered`} className="flex gap-1">
      {items.map((item, at) => (
        <span
          key={item.position}
          className={cn(
            "h-1.5 flex-1 rounded-full bg-subtle",
            item.result !== null ? "bg-success" : at === index && "bg-accent",
          )}
        />
      ))}
    </div>
  );
}

function Questions({ view }: { view: AssessmentViewResponse }) {
  const queryClient = useQueryClient();
  const attempt = view.attempt;
  if (!attempt) return null;
  const day = view.day;
  return (
    <QuizRunner
      quiz={{ attemptId: attempt.id, items: attempt.items }}
      labels={{
        title: `Week ${view.week} assessment`,
        check: "Submit answer",
        submit: "Submit answer",
        next: "Next question",
        finish: "See your result",
        icon: <ArrowRight aria-hidden="true" className="size-4" />,
      }}
      onAnswered={async (position, result) => {
        // A poll in flight (another answer being scored) must not overwrite this answer.
        await queryClient.cancelQueries({ queryKey: learningKeys.assessment(day), exact: true });
        queryClient.setQueryData<AssessmentViewResponse>(learningKeys.assessment(day), (current) =>
          current?.attempt
            ? {
                ...current,
                attempt: {
                  ...current.attempt,
                  items: current.attempt.items.map((item) =>
                    item.position === position ? { ...item, result } : item,
                  ),
                },
              }
            : current,
        );
      }}
      onFinished={() => {
        // The view turns passed / failed with the result; the next day may open.
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: learningKeys.assessment(day) }),
          queryClient.invalidateQueries({ queryKey: learningKeys.day(day + 1), exact: true }),
          queryClient.invalidateQueries({ queryKey: learningKeys.course }),
          queryClient.invalidateQueries({ queryKey: learningKeys.plan }),
          queryClient.invalidateQueries({ queryKey: learningKeys.home }),
        ]);
      }}
      layout={({ index, total, question, message, action }) => (
        <>
          <article aria-labelledby="assessment-title" className={articleClass}>
            <Heading
              kicker={`Week ${view.week} · Assessment · question ${index + 1} of ${total}`}
              title={`Week ${view.week} assessment`}
            />
            <ProgressStrip items={attempt.items} index={index} />
            {question}
          </article>
          {/* "Answers are final." is said before the start; the footer only shows errors. */}
          <Footer view={view} message={typeof message === "string" ? null : message}>
            {action}
          </Footer>
        </>
      )}
    />
  );
}

// ── Result ──────────────────────────────────────────────────────────────────────────────────────

function ResultBox({
  result,
  view,
  gate,
}: {
  result: AssessmentResult;
  view: AssessmentViewResponse;
  /** The gate that follows this week (Week 4: Gate 1): it, not the next day, comes next. */
  gate?: number;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-5 rounded-card px-5.5 py-5",
        result.passed ? "bg-success-soft" : "border border-line bg-surface",
      )}
    >
      <p
        className={cn(
          "shrink-0 text-score font-bold tabular-nums",
          result.passed ? "text-success" : "text-danger",
        )}
      >
        {result.choiceCorrect}
        <span className="text-xl text-muted">/{result.choiceTotal}</span>
        <span className="sr-only"> correct</span>
      </p>
      <p className="min-w-0">
        <b className="block text-md font-semibold tabular-nums">{result.percent}% on multiple choice</b>
        <span className="text-base text-fg-2">
          {result.passed
            ? `Pass mark ${view.rules.passPercent}%. ${gate ? `Gate ${gate} is next.` : `Day ${view.day + 1} is open.`}`
            : `You need ${view.rules.passPercent}% to continue.`}
        </span>
      </p>
    </div>
  );
}

function Result({ view, course }: { view: AssessmentViewResponse; course: Course }) {
  const start = useStart(view.day);
  // "Retake opens tomorrow at 9:00 am" is worked out once, when the result is shown.
  const [now] = useState(() => new Date());
  const attempt = view.attempt;
  const result = attempt?.result;
  const retake = retakeLabel(result?.retakeAt ?? null, now);
  if (!attempt || !result) return null;
  const week = course?.weeks.find((entry) => entry.number === view.week);
  const nextWeek = course?.weeks.find((entry) => entry.number === view.week + 1);
  return (
    <>
      <article aria-labelledby="assessment-title" className={articleClass}>
        <Heading
          kicker={`Week ${view.week} · Assessment · result`}
          title={
            result.passed
              ? `You passed the Week ${view.week} assessment`
              : `Week ${view.week} assessment: not passed yet`
          }
        />
        <ResultBox result={result} view={view} gate={week?.gate?.gate} />
        {!result.passed ? (
          <div className="flex flex-col gap-2 text-base text-fg-2">
            <p>
              {view.canRetake
                ? "You can retake it now, with new questions."
                : `${retake ?? "The retake opens soon"}, with new questions.`}{" "}
              Day {view.day + 1} stays locked until you pass.
            </p>
            {week && week.days.length > 0 ? (
              <p>
                Until then, revise:{" "}
                {week.days.map((day, at) => (
                  <span key={day.day}>
                    {at > 0 ? " · " : null}
                    <Link
                      to="/app/day/$day"
                      params={{ day: day.day }}
                      preload={false}
                      className="text-accent-text underline underline-offset-2"
                    >
                      Day {day.day} {day.title}
                    </Link>
                  </span>
                ))}
              </p>
            ) : null}
          </div>
        ) : null}
        <ReviewNote view={view} />
        <Card aria-labelledby="answers-title">
          <CardHeader title={<span id="answers-title">Your answers</span>} />
          <ol className="px-4 pb-1">
            {attempt.items.map((item) => (
              <AnswerRow key={item.position} item={item} />
            ))}
          </ol>
        </Card>
        {result.passed ? (
          <div className="flex items-center gap-4 rounded-card bg-success-soft px-4.5 py-4">
            <CircleCheck aria-hidden="true" className="size-6 shrink-0 text-success" />
            <span>
              <b className="block font-semibold">That&apos;s Week {view.week}.</b>
              <span className="text-base text-fg-2">
                {week?.gate
                  ? `Next: Gate ${week.gate.gate}, a live call with your manager. `
                  : nextWeek
                    ? `Next week: ${nextWeek.title}. `
                    : ""}
                AI feedback on written answers is in your answers above.
              </span>
            </span>
          </div>
        ) : null}
        {view.history.length > 0 ? <History view={view} /> : null}
      </article>
      <Footer
        view={view}
        message={
          start.isError ? (
            <span role="alert" className="text-danger">
              {errorMessage(start.error)}
            </span>
          ) : null
        }
      >
        <div className="flex max-w-full flex-wrap justify-end gap-2">
          {(result.passed || view.unlockAll) && week?.gate ? (
            <Link
              to="/app/gate/$gate"
              params={{ gate: week.gate.gate }}
              className={buttonVariants({
                variant: result.passed ? "primary" : "secondary",
                size: "lg",
                className: "max-w-full",
              })}
            >
              <span className="truncate">Next: Gate {week.gate.gate}</span>
              <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
            </Link>
          ) : result.passed || view.unlockAll ? (
            <Link
              to="/app/day/$day"
              params={{ day: view.day + 1 }}
              preload={false}
              className={buttonVariants({
                variant: result.passed ? "primary" : "secondary",
                size: "lg",
                className: "max-w-full",
              })}
            >
              <span className="truncate">Start Day {view.day + 1}</span>
              <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
            </Link>
          ) : null}
          {!result.passed ? (
            <Button
              variant="primary"
              size="lg"
              className="max-w-full"
              disabled={!view.canRetake || start.isPending}
              onClick={() => {
                start.mutate();
              }}
            >
              <span className="truncate">{start.isPending ? "Starting…" : "Retake the assessment"}</span>
              {start.isPending ? null : <ArrowRight aria-hidden="true" className="size-4 shrink-0" />}
            </Button>
          ) : null}
        </div>
      </Footer>
    </>
  );
}

function AnswerRow({ item }: { item: QuizItem }) {
  const result = item.result;
  const written = item.type === "written";
  const pending = written && (result === null || result.aiScore?.status === "pending");
  const correct = !written && result?.correct === true;
  const wrong = !written && result?.correct === false;
  const chosen = result?.choice ?? null;
  const explanation = chosen !== null ? result?.explanations[chosen] : undefined;
  const right =
    wrong && result?.correctIndex !== null && result?.correctIndex !== undefined
      ? item.options?.[result.correctIndex]
      : undefined;
  return (
    <li className="flex items-start gap-3 border-t border-line py-2.5 first:border-t-0">
      <span
        className={cn(
          "mt-0.5 grid size-5.5 shrink-0 place-items-center rounded-full bg-subtle text-xs text-muted",
          correct && "bg-success-soft text-success",
          wrong && "bg-danger-soft text-danger",
        )}
      >
        {written && !pending ? <PenLine aria-hidden="true" className="size-3" /> : null}
        <span aria-hidden="true">{correct ? "✓" : wrong ? "✕" : pending ? "…" : ""}</span>
        <span className="sr-only">
          {correct ? "Correct" : wrong ? "Not correct" : pending ? "Being scored" : "Written answer"}
        </span>
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-medium">
          {written ? "Written: " : null}
          <Markdown inline>{item.stem}</Markdown>
        </span>
        <div className="flex flex-col gap-1.5 text-sm text-muted">
          {written ? (
            <>
              {result?.modelAnswer ? (
                <div className="rounded-ctl border border-line bg-subtle p-2.5 text-fg-2">
                  <span className="block text-xs font-medium tracking-wider text-muted uppercase">
                    Model answer
                  </span>
                  <Markdown>{result.modelAnswer}</Markdown>
                </div>
              ) : null}
              {result?.aiScore ? (
                <AiFeedback score={result.aiScore} />
              ) : pending ? (
                <span>Being scored. You&apos;ll see the score here.</span>
              ) : null}
            </>
          ) : (
            <>
              {explanation ? <Markdown inline>{explanation}</Markdown> : null}
              {right ? (
                <span>
                  Better: <Markdown inline>{right}</Markdown>
                </span>
              ) : null}
            </>
          )}
        </div>
      </div>
    </li>
  );
}

const DATE_TIME = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

function History({ view }: { view: AssessmentViewResponse }) {
  return (
    <Card aria-labelledby="history-title">
      <CardHeader title={<span id="history-title">Earlier attempts</span>} />
      <ol className="px-4 pb-1 text-base">
        {view.history.map((entry) => (
          <li
            key={entry.number}
            className="flex flex-wrap items-center gap-x-3 border-t border-line py-2.5 tabular-nums first:border-t-0"
          >
            <span className="font-medium">Attempt {entry.number}</span>
            <span className="text-fg-2">
              {entry.result.choiceCorrect}/{entry.result.choiceTotal} · {entry.result.percent}%
            </span>
            <span className={entry.result.passed ? "text-success" : "text-muted"}>
              {entry.result.passed ? "Passed" : "Not passed"}
            </span>
            <span className="ml-auto text-sm text-muted">
              {DATE_TIME.format(new Date(entry.completedAt))}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
