import {
  type CourseOutlineResponse,
  type DayViewResponse,
  type FinalStatus,
  type GateSummary,
  type OutlineDay,
} from "@portal/contracts";
import { Link } from "@tanstack/react-router";
import { Check, ChevronDown, ChevronRight, Lock, ShieldCheck } from "lucide-react";
import { Notice } from "@/components/ui/page-header";
import { FINAL_STATUS_LABEL } from "@/features/final-review/final-review";
import { outlineGateHint } from "@/features/gates/gates";
import { RoundBadge } from "@/features/gates/round-badge";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { outlineHint } from "../assessment";
import { blockDays } from "../plan";
import { dayItems, dayOpen, itemDone, itemLocked, outlineCount } from "../player-nav";

/**
 * The course outline (docs/design/course-player.html): phase → week → day → lessons. The open day
 * lists its lessons and, last, the daily quiz. Days not imported yet say "Coming soon"; locked days
 * and lessons show a lock and can't be opened.
 */

const rowClass = "flex w-full items-center gap-2.5 rounded-ctl px-2.5 py-2 text-left text-base";

export function CourseOutline({
  course,
  data,
  item = null,
  assessmentDay,
  gateNo,
  finalReview = false,
  onNavigate,
}: {
  course: { data?: CourseOutlineResponse; isPending: boolean; error: Error | null };
  /** The open day (its lessons are listed), unless an assessment is shown. */
  data?: DayViewResponse;
  /** The lesson id (or "quiz") being shown. */
  item?: string | null;
  /** The assessment being shown (its day: 5, 10 …). */
  assessmentDay?: number;
  /** The gate being shown (1). */
  gateNo?: number;
  /** The final review is shown. */
  finalReview?: boolean;
  /** Called after a link is followed (closes the phone drawer). */
  onNavigate?: () => void;
}) {
  if (course.isPending)
    return (
      <p role="status" className="px-2.5 py-2 text-sm text-muted">
        Loading the outline…
      </p>
    );
  if (!course.data)
    return (
      <div className="px-2.5">
        <Notice tone="warning">{errorMessage(course.error)}</Notice>
      </div>
    );
  const outline = course.data;
  return (
    <div className="flex flex-col">
      {outline.phases.map((phase, phaseIndex) => (
        <div key={phase.number} className={cn(phaseIndex > 0 && "mt-3")}>
          <p className="px-2.5 pt-1.5 pb-1 text-xs font-semibold tracking-wider text-muted uppercase">
            Phase {phase.number} · {phase.name}
          </p>
          {outline.weeks
            .filter((week) => week.phase === phase.number)
            .map((week) => (
              <Week
                key={week.number}
                week={week}
                data={data}
                item={item}
                assessmentDay={assessmentDay}
                gateNo={gateNo}
                finalReview={finalReview}
                unlockAll={outline.unlockAll}
                onNavigate={onNavigate}
              />
            ))}
        </div>
      ))}
    </div>
  );
}

function Week({
  week,
  data,
  item,
  assessmentDay,
  gateNo,
  finalReview,
  unlockAll,
  onNavigate,
}: {
  week: CourseOutlineResponse["weeks"][number];
  data?: DayViewResponse;
  item: string | null;
  assessmentDay?: number;
  gateNo?: number;
  finalReview: boolean;
  unlockAll: boolean;
  onNavigate?: () => void;
}) {
  const { first, last } = blockDays(week.number);
  const holdsOpenDay =
    week.days.some((day) => day.day === data?.day) ||
    (week.assessment !== null && week.assessment.day === assessmentDay) ||
    (week.gate !== null && week.gate.gate === gateNo) ||
    (week.finalReview !== null && finalReview);
  const allComingSoon = week.days.every((day) => day.lessons.length === 0);
  const allLocked =
    !unlockAll && week.days.every((day) => day.status === "locked" || day.lessons.length === 0);
  // A week with nothing to open folds into one row ("Days 6–10"), as in the mockup.
  const folded = !holdsOpenDay && (allComingSoon || allLocked);
  return (
    <div>
      <p className="px-2.5 pt-3 pb-1.5 text-sm font-semibold text-fg-2">
        Week {week.number} · {week.title}
      </p>
      {folded ? (
        <div aria-disabled="true" className={cn(rowClass, "text-muted")}>
          <ChevronRight aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="tabular-nums">
            Days {first}–{last}
          </span>
          <span className="ml-auto flex items-center gap-1 text-xs">
            {allComingSoon ? (
              "Coming soon"
            ) : (
              <>
                <Lock aria-hidden="true" className="size-3.5" />
                <span className="sr-only">Locked</span>
              </>
            )}
          </span>
        </div>
      ) : (
        <ul className="flex flex-col">
          {week.days.map((day) => (
            <li key={day.day}>
              <DayRow day={day} open={day.day === data?.day} unlockAll={unlockAll} onNavigate={onNavigate} />
              {data && day.day === data.day ? (
                <Lessons data={data} item={item} onNavigate={onNavigate} />
              ) : null}
              {/* The final review is booked once Day 64 is done; Day 65 is its day. */}
              {week.finalReview && day.day === FINAL_AFTER_DAY ? (
                <FinalRow status={week.finalReview.status} current={finalReview} onNavigate={onNavigate} />
              ) : null}
            </li>
          ))}
          {week.assessment ? (
            <li>
              <AssessmentRow
                week={week.number}
                assessment={week.assessment}
                current={week.assessment.day === assessmentDay}
                unlockAll={unlockAll}
                onNavigate={onNavigate}
              />
            </li>
          ) : null}
          {week.gate ? (
            <li>
              <GateRow gate={week.gate} current={week.gate.gate === gateNo} onNavigate={onNavigate} />
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}

function DayRow({
  day,
  open,
  unlockAll,
  onNavigate,
}: {
  day: OutlineDay;
  open: boolean;
  unlockAll: boolean;
  onNavigate?: () => void;
}) {
  const comingSoon = day.lessons.length === 0;
  const locked = !comingSoon && !unlockAll && day.status === "locked";
  const count = outlineCount(day);
  const Chevron = open ? ChevronDown : ChevronRight;
  const content = (
    <>
      <Chevron aria-hidden="true" className="size-3.5 shrink-0 text-muted" />
      <span className="w-12 shrink-0 text-xs font-medium whitespace-nowrap text-muted tabular-nums">
        Day {day.day}
      </span>
      <span className="min-w-0 flex-1 truncate">{day.title}</span>
      <RoundBadge round={day.round} />
      <span className="ml-auto shrink-0 text-xs font-normal text-muted tabular-nums">
        {comingSoon ? (
          "Coming soon"
        ) : locked ? (
          <>
            <Lock aria-hidden="true" className="size-3.5" />
            <span className="sr-only">Locked</span>
          </>
        ) : (
          <>
            {count.done}/{count.total}
            <span className="sr-only"> done</span>
          </>
        )}
      </span>
    </>
  );
  if (comingSoon || locked || !(dayOpen(day) || unlockAll))
    return (
      <div aria-disabled="true" className={cn(rowClass, "text-muted")}>
        {content}
      </div>
    );
  return (
    <Link
      to="/app/day/$day"
      params={{ day: day.day }}
      preload={false}
      activeOptions={{ exact: true }}
      onClick={onNavigate}
      className={cn(rowClass, "hover:bg-subtle", open && "font-semibold")}
    >
      {content}
    </Link>
  );
}

/** "◆ Week 1 assessment", dashed; the current one in the accent (docs/design/course-player.html). */
function AssessmentRow({
  week,
  assessment,
  current,
  unlockAll,
  onNavigate,
}: {
  week: number;
  assessment: NonNullable<CourseOutlineResponse["weeks"][number]["assessment"]>;
  current: boolean;
  unlockAll: boolean;
  onNavigate?: () => void;
}) {
  const locked = assessment.status === "locked" && !unlockAll && !current;
  const disabled = assessment.status === "not_ready" || locked;
  const className = cn(
    rowClass,
    "mt-1 border border-dashed border-line-strong",
    disabled && "text-muted",
    current && "border-accent bg-accent-50 font-semibold text-accent-text",
  );
  const content = (
    <>
      <span aria-hidden="true" className="w-3.5 shrink-0 text-center text-xs text-accent">
        ◆
      </span>
      <span className="min-w-0 flex-1 truncate">Week {week} assessment</span>
      <span
        className={cn(
          "ml-auto shrink-0 text-xs font-normal text-muted tabular-nums",
          assessment.status === "passed" && "text-success",
        )}
      >
        {assessment.status === "locked" ? (
          <>
            <Lock aria-hidden="true" className="size-3.5" />
            <span className="sr-only">Locked</span>
          </>
        ) : current ? (
          <span className="sr-only">{outlineHint(assessment.status)}</span>
        ) : (
          outlineHint(assessment.status)
        )}
      </span>
    </>
  );
  if (disabled)
    return (
      <div aria-disabled="true" className={className}>
        {content}
      </div>
    );
  return (
    <Link
      to="/app/assessment/$day"
      params={{ day: assessment.day }}
      onClick={onNavigate}
      aria-current={current ? "page" : undefined}
      className={cn(className, !current && "hover:bg-subtle")}
    >
      {content}
    </Link>
  );
}

/** "◆ Gate 1", dashed like the assessment row; it opens even before Day 20 (the page says when it opens). */
const FINAL_AFTER_DAY = 64;

function FinalRow({
  status,
  current,
  onNavigate,
}: {
  status: FinalStatus;
  current: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      to="/app/final-review"
      onClick={onNavigate}
      aria-current={current ? "page" : undefined}
      className={cn(
        rowClass,
        "my-1 border border-dashed border-line-strong",
        status === "locked" && "text-muted",
        current ? "border-accent bg-accent-50 font-semibold text-accent-text" : "hover:bg-subtle",
      )}
    >
      <ShieldCheck aria-hidden="true" className="size-3.5 shrink-0 text-accent" />
      <span className="min-w-0 flex-1 truncate">Final review</span>
      <span
        className={cn(
          "ml-auto shrink-0 text-xs font-normal text-muted",
          status === "recorded" && "text-success",
        )}
      >
        {status === "locked" ? (
          <>
            <Lock aria-hidden="true" className="size-3.5" />
            <span className="sr-only">Opens after Day {FINAL_AFTER_DAY}</span>
          </>
        ) : current ? (
          <span className="sr-only">{FINAL_STATUS_LABEL[status].engineer}</span>
        ) : (
          FINAL_STATUS_LABEL[status].engineer
        )}
      </span>
    </Link>
  );
}

function GateRow({
  gate,
  current,
  onNavigate,
}: {
  gate: GateSummary;
  current: boolean;
  onNavigate?: () => void;
}) {
  const hint = outlineGateHint(gate.status);
  const passed = gate.status === "passed" || gate.status === "passed_focus";
  return (
    <Link
      to="/app/gate/$gate"
      params={{ gate: gate.gate }}
      onClick={onNavigate}
      aria-current={current ? "page" : undefined}
      className={cn(
        rowClass,
        "mt-1 border border-dashed border-line-strong",
        gate.status === "locked" && "text-muted",
        current ? "border-accent bg-accent-50 font-semibold text-accent-text" : "hover:bg-subtle",
      )}
    >
      <ShieldCheck aria-hidden="true" className="size-3.5 shrink-0 text-accent" />
      <span className="min-w-0 flex-1 truncate">Gate {gate.gate}</span>
      <span
        className={cn(
          "ml-auto shrink-0 text-xs font-normal text-muted tabular-nums",
          passed && "text-success",
        )}
      >
        {gate.status === "locked" ? (
          <>
            <Lock aria-hidden="true" className="size-3.5" />
            <span className="sr-only">Opens after Day {gate.afterDay}</span>
          </>
        ) : current ? (
          <span className="sr-only">{hint}</span>
        ) : (
          hint
        )}
      </span>
    </Link>
  );
}

function StatusCircle({ done, current }: { done: boolean; current: boolean }) {
  return (
    <span
      className={cn(
        "mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full border-2 border-line-strong",
        done && "border-success bg-success text-surface",
        !done && current && "border-accent bg-accent inset-ring-3 inset-ring-surface",
      )}
    >
      {done ? <Check aria-hidden="true" strokeWidth={3} className="size-2.5" /> : null}
      <span className="sr-only">{done ? "Done" : current ? "Current" : "To do"}</span>
    </span>
  );
}

function Lessons({
  data,
  item,
  onNavigate,
}: {
  data: DayViewResponse;
  item: string | null;
  onNavigate?: () => void;
}) {
  return (
    <ul className="mt-0.5 mb-1.5 flex flex-col gap-px pl-5.5">
      {dayItems(data).map((entry) => {
        const done = itemDone(data, entry.id);
        const locked = !data.unlockAll && itemLocked(data, entry.id) && !done;
        const current = entry.id === item;
        const text = (
          <span className="min-w-0">
            {entry.title}
            <span className="block text-xs font-normal text-muted">{entry.meta}</span>
          </span>
        );
        const lessonClass = "flex w-full items-start gap-2.5 rounded-ctl px-2.5 py-2 text-left text-base";
        return (
          <li key={entry.id}>
            {locked ? (
              <span aria-disabled="true" className={cn(lessonClass, "text-muted")}>
                <Lock aria-hidden="true" className="mt-0.5 size-4.5 shrink-0 p-0.5" />
                <span className="sr-only">Locked: </span>
                {text}
              </span>
            ) : (
              <Link
                to="/app/day/$day/$lesson"
                params={{ day: data.day, lesson: entry.id }}
                preload={false}
                onClick={onNavigate}
                className={cn(
                  lessonClass,
                  "text-fg-2 hover:bg-subtle current:bg-accent-50 current:font-semibold current:text-accent-text",
                )}
              >
                <StatusCircle done={done} current={current} />
                {text}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
