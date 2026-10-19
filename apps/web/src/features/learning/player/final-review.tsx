import { FINAL_OUTCOME_TEXT, type FinalReviewViewResponse } from "@portal/contracts";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Notice } from "@/components/ui/page-header";
import {
  FINAL_STATUS_LABEL,
  FinalBars,
  FinalOutcomeBadge,
  FinalResultDetails,
} from "@/features/final-review/final-review";
import { myFinalReviewQuery } from "@/features/final-review/queries";
import { dayOpen, outlineDay } from "../player-nav";
import { courseQuery } from "../queries";
import { FactsTable, panelClass } from "./blocks";
import { CourseOutline } from "./outline";
import { articleClass, PlayerFrame } from "./player";

/** The day the readiness case is shared; the review follows it. */
const CASE_DAY = 64;

/**
 * The final review in the course player (docs/PORTAL_PLAN.md §3 "Final review"; PDF "Final review — Day
 * 90"): the manager or PM observes a real client call the engineer leads, then a 45-minute review. The
 * engineer books it once Day 64 is done and the readiness case is shared. A checkpoint, not a story lesson.
 */
export function FinalReviewPlayer() {
  const { data: view } = useSuspenseQuery(myFinalReviewQuery);
  const course = useQuery(courseQuery);
  const phase = course.data?.phases.at(-1);
  return (
    <PlayerFrame
      crumb={phase ? `Phase ${phase.number} · ${phase.name}` : undefined}
      day={CASE_DAY}
      scrollKey={`final-review/${view.status}`}
      outline={(onNavigate) => <CourseOutline course={course} finalReview onNavigate={onNavigate} />}
    >
      <article aria-labelledby="final-title" className={articleClass}>
        <div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted tabular-nums">
            <span>Final review · after Day {CASE_DAY} · 45 min with your manager</span>
            <Badge
              tone={view.status === "recorded" ? "success" : view.status === "to_book" ? "accent" : "neutral"}
            >
              {FINAL_STATUS_LABEL[view.status].engineer}
            </Badge>
          </p>
          <h1 id="final-title" className="mt-1 text-title font-bold">
            Final review
          </h1>
        </div>
        <FinalBody view={view} />
      </article>
      <FinalFooter view={view} />
    </PlayerFrame>
  );
}

function FinalBody({ view }: { view: FinalReviewViewResponse }) {
  if (view.status === "recorded" && view.result) {
    const text = FINAL_OUTCOME_TEXT[view.result.outcome];
    return (
      <>
        <div role="status" className="rounded-card bg-subtle px-4.5 py-4">
          <b className="block font-semibold">Your decision: {text.label}</b>
          <span className="text-base text-fg-2">{text.next}</span>
        </div>
        <Card aria-labelledby="result-title">
          <CardHeader
            title={<span id="result-title">Your result</span>}
            aside={<FinalOutcomeBadge outcome={view.result.outcome} />}
          />
          <CardBody>
            <FinalResultDetails result={view.result} />
          </CardBody>
        </Card>
        <p className="max-w-prose text-base text-fg-2">
          After Day 90: keep one mock a week, and consider visiting a Toastmasters online club as a free
          guest.
        </p>
      </>
    );
  }
  return (
    <>
      <p className="max-w-prose text-md text-fg-2">
        Day 90 is about proof — to yourself and to management — that you can run the client relationship
        without a PM.
      </p>
      <div className={panelClass}>
        <FactsTable
          rows={[
            {
              label: "Observed call",
              value: "Your manager or PM joins a real client call you lead (usually your Day 62 solo call).",
            },
            {
              label: "The review",
              value:
                "45 minutes: your written follow-ups from the solo week, PM or senior feedback, and your readiness case.",
            },
          ]}
        />
      </div>
      <section aria-labelledby="decision-title" className="flex flex-col gap-2">
        <h2 id="decision-title" className="text-lg">
          The decision
        </h2>
        <FinalBars />
      </section>
      {view.status === "locked" ? (
        <Notice tone="info">Opens once Day {CASE_DAY} is done and your readiness case is shared.</Notice>
      ) : (
        <div className="flex items-start gap-2.5 rounded-card bg-info-soft px-3.5 py-3 text-base">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-info" />
          <span className="min-w-0">
            <b className="font-semibold">Book it with your manager.</b> Agree which real client call they (or
            your PM) will observe, and a 45-minute slot for the review. Your readiness case is already shared
            with them.
          </span>
        </div>
      )}
      {view.pendingLive.length > 0 ? (
        <Notice tone="warning">
          {view.pendingLive.length === 1 ? "A live-call day is" : "Some live-call days are"} still scheduled
          for later:{" "}
          {view.pendingLive.map((day, index) => (
            <span key={day}>
              {index > 0 ? ", " : null}
              <Link
                to="/app/day/$day"
                params={{ day }}
                preload={false}
                className="underline underline-offset-2"
              >
                Day {day}
              </Link>
            </span>
          ))}
          . Update {view.pendingLive.length === 1 ? "it" : "them"} once the call has happened: the review can
          only be recorded after that.
        </Notice>
      ) : null}
    </>
  );
}

/** Previous (Day 64) · "Final review" · Day 65. */
function FinalFooter({ view }: { view: FinalReviewViewResponse }) {
  const course = useQuery(courseQuery);
  const next = outlineDay(course.data, CASE_DAY + 1);
  return (
    <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-line bg-bg px-4 py-3 lg:px-12 lg:py-3.5">
      <Link
        to="/app/day/$day"
        params={{ day: CASE_DAY }}
        preload={false}
        className={buttonVariants({ size: "lg", className: "shrink-0" })}
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        <span className="max-sm:sr-only">Previous</span>
      </Link>
      <span className="hidden min-w-0 truncate text-center text-sm text-muted tabular-nums md:block">
        Week 13 · Final review
      </span>
      {dayOpen(next) ? (
        <Link
          to="/app/day/$day"
          params={{ day: CASE_DAY + 1 }}
          preload={false}
          className={buttonVariants({
            variant: view.status === "locked" ? "secondary" : "primary",
            size: "lg",
            className: "max-w-full",
          })}
        >
          <span className="truncate">Day {CASE_DAY + 1}</span>
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
