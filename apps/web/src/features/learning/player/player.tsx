import { type CourseOutlineResponse, type DayViewResponse, type LessonEntry } from "@portal/contracts";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, PanelLeft, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/shell/app-shell";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { Collapsible } from "@/components/ui/collapsible";
import { Markdown } from "@/components/ui/markdown";
import { Notice } from "@/components/ui/page-header";
import { gateAfter, roundLabel } from "@/features/gates/gates";
import { ApiError, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { stayAfterSave } from "../ai-score";
import { assessmentAfter, assessmentWeek } from "../assessment";
import { LAST_DAY, lockMessage, NOT_READY_MESSAGE, phaseLabel, safetyReminders } from "../plan";
import {
  dayItems,
  dayOpen,
  itemDone,
  itemLocked,
  kicker,
  lastItemOf,
  lessonState,
  mapFieldErrors,
  missingParts,
  outlineDay,
  type PlayerItem,
  QUIZ_ID,
  startEntry,
  startItem,
} from "../player-nav";
import { courseQuery, dayQuery, learningKeys, saveLesson } from "../queries";
import { AiFeedback } from "./ai-feedback";
import { LessonBlock, panelClass } from "./blocks";
import {
  Baseline,
  Checks,
  Fields,
  InlineField,
  RealProjectCheck,
  Rounds,
  Rubric,
  Scorecard,
  scorecardFieldIds,
  ScorecardNotes,
} from "./lesson-inputs";
import { LiveCall } from "./live-call";
import { MockCard } from "./mock-card";
import { CourseOutline } from "./outline";
import { QuizLesson } from "./quiz-lesson";
import type * as React from "react";

/**
 * The course player (docs/design/course-player.html): a top bar, the course outline on the left
 * (a drawer below 1024px), one lesson at a time, and Previous / Next in a sticky footer.
 */

type CourseState = ReturnType<typeof useQuery<CourseOutlineResponse>>;

function phaseName(course: CourseOutlineResponse | undefined, data: DayViewResponse): string {
  const phase = course?.phases.find((entry) => entry.number === data.block.phase);
  return phase ? `Phase ${phase.number} · ${phase.name}` : phaseLabel(data.day);
}

/** The frame without lesson data: used by the player and by its error screen. */
export function PlayerTopBar({
  crumb,
  day,
  outlineButton,
}: {
  crumb?: string;
  day?: number;
  outlineButton?: React.ReactNode;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-surface px-4 lg:px-5">
      <Logo />
      <span className="hidden truncate text-base font-semibold sm:inline">Client-Ready Engineer</span>
      {day ? (
        <span className="text-sm text-muted tabular-nums sm:hidden">
          Day {day} of {LAST_DAY}
        </span>
      ) : null}
      {crumb ? (
        <>
          <span aria-hidden="true" className="hidden h-5 w-px bg-line lg:block" />
          <span className="hidden text-base text-muted lg:inline">{crumb}</span>
        </>
      ) : null}
      <span className="flex-1" />
      {day ? (
        <div className="hidden items-center gap-2.5 text-sm text-muted lg:flex">
          <span className="tabular-nums">
            Day {day} of {LAST_DAY}
          </span>
          <progress
            className="player-progress"
            value={day}
            max={LAST_DAY}
            aria-label={`Day ${day} of ${LAST_DAY}`}
          />
        </div>
      ) : null}
      {outlineButton}
      <ThemeToggle />
      <Link to="/app" className={buttonVariants({ className: "h-8 px-3 text-base font-normal text-fg-2" })}>
        Exit
      </Link>
    </header>
  );
}

/** The full-screen frame: top bar, the outline (a drawer below 1024px) and the scrolling main column. */
export function PlayerFrame({
  crumb,
  day,
  scrollKey,
  outline,
  children,
}: {
  crumb?: string;
  day: number;
  /** A new value scrolls the main column back to the top (a new lesson starts at the top). */
  scrollKey: string;
  outline: (onNavigate?: () => void) => React.ReactNode;
  children: React.ReactNode;
}) {
  const [drawer, setDrawer] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [scrollKey]);

  const closeDrawer = () => {
    setDrawer(false);
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg">
      <PlayerTopBar
        crumb={crumb}
        day={day}
        outlineButton={
          <Dialog.Root open={drawer} onOpenChange={setDrawer}>
            <Dialog.Trigger
              className={buttonVariants({ className: "h-8 px-3 text-base font-normal lg:hidden" })}
            >
              <PanelLeft aria-hidden="true" className="size-4" />
              Outline
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-fg/30" />
              <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-75 max-w-full flex-col bg-surface shadow-panel">
                <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
                  <Dialog.Title className="text-base font-semibold">Course outline</Dialog.Title>
                  <Dialog.Close
                    className={buttonVariants({ variant: "ghost", size: "sm" })}
                    aria-label="Close"
                  >
                    <X aria-hidden="true" className="size-4" />
                  </Dialog.Close>
                </div>
                <Dialog.Description className="sr-only">
                  Weeks, days and lessons of the course.
                </Dialog.Description>
                <nav
                  aria-label="Course outline"
                  className="relative min-h-0 flex-1 overflow-y-auto px-3 pt-2 pb-6"
                >
                  {outline(closeDrawer)}
                </nav>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        }
      />
      <div className="flex min-h-0 flex-1">
        <nav
          aria-label="Course outline"
          className="relative hidden w-75 shrink-0 overflow-y-auto border-r border-line bg-surface px-3 pt-4 pb-6 lg:block"
        >
          {outline()}
        </nav>
        <main ref={mainRef} className="relative flex min-w-0 flex-1 flex-col overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

export function Player({ day, item }: { day: number; item: string | null }) {
  const { data } = useSuspenseQuery(dayQuery(day));
  const course = useQuery(courseQuery);
  return (
    <PlayerFrame
      crumb={phaseName(course.data, data)}
      day={data.day}
      scrollKey={`${day}/${item ?? ""}`}
      outline={(onNavigate) => (
        <CourseOutline course={course} data={data} item={item} onNavigate={onNavigate} />
      )}
    >
      <PlayerMain key={`${data.day}/${item ?? ""}`} data={data} course={course} item={item} />
    </PlayerFrame>
  );
}

export const articleClass = "flex w-full max-w-240 flex-1 flex-col gap-6 px-4 py-6 lg:px-12 lg:pt-9 lg:pb-8";

function PlayerMain({
  data,
  course,
  item,
}: {
  data: DayViewResponse;
  course: CourseState;
  item: string | null;
}) {
  const items = dayItems(data);
  const index = items.findIndex((entry) => entry.id === item);
  const current = items[index];

  if (data.status === "locked" || data.status === "not_ready" || !current) {
    const message =
      data.status === "locked"
        ? lockMessage(data.lockReason, data.day)
        : data.status === "not_ready" || items.length === 0
          ? NOT_READY_MESSAGE
          : "This day doesn't have that lesson.";
    return (
      <article className={articleClass}>
        <div>
          <p className="text-sm text-muted tabular-nums">Day {data.day}</p>
          <h1 className="mt-1 text-title font-bold">{data.title}</h1>
        </div>
        <Notice tone="info">{message}</Notice>
        <div>
          <Link to="/app/plan" className={buttonVariants({ variant: "primary", size: "lg" })}>
            Go to My plan
          </Link>
        </div>
      </article>
    );
  }

  return <LessonScreen data={data} course={course.data} items={items} index={index} current={current} />;
}

function LessonScreen({
  data,
  course,
  items,
  index,
  current,
}: {
  data: DayViewResponse;
  course: CourseOutlineResponse | undefined;
  items: PlayerItem[];
  index: number;
  current: PlayerItem;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const lesson = data.lessons.find((entry) => entry.id === current.id);
  const state = lessonState(data, current.id);
  const prefill = lesson?.prefillFrom
    ? data.recalls.find((r) => r.day === lesson.prefillFrom?.day && r.lesson === lesson.prefillFrom.lesson)
    : undefined;
  const [entry, setEntry] = useState<LessonEntry>(() =>
    startEntry(state?.entry, lesson?.rounds, prefill?.values),
  );
  /**
   * Write lessons with an AI score: the saved entry the feedback below is for (null: no feedback shown).
   * Next moves on without saving again while the answer is unchanged.
   */
  const [scoredEntry, setScoredEntry] = useState<string | null>(() =>
    state?.aiScore ? JSON.stringify(startEntry(state.entry, lesson?.rounds)) : null,
  );
  const feedbackRef = useRef<HTMLHeadingElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [footerError, setFooterError] = useState("");
  const [saving, setSaving] = useState(false);

  const isQuiz = current.id === QUIZ_ID;
  const locked = !data.unlockAll && itemLocked(data, current.id) && !itemDone(data, current.id);
  const next = items[index + 1];
  // The first lesson after a week's assessment goes back to it.
  // The first lesson after a gate (Day 21) goes back to the gate.
  const previousGate = index === 0 ? gateAfter(course, data.day - 1) : null;
  const previousAssessment =
    index === 0 && !previousGate && assessmentAfter(course, data.day - 1) ? data.day - 1 : null;
  const previous = previousAssessment || previousGate ? null : previousTarget(data, course, items, index);
  const round = roundLabel(data.round);
  const nextDay = outlineDay(course, data.day + 1);
  const assessment = assessmentAfter(course, data.day);
  const cardId = lesson?.kind === "live" ? lesson.substituteCardId : lesson?.cardId;
  const card = cardId ? data.cards.find((entry) => entry.id === cardId) : undefined;
  const lead = lesson?.lead ?? (lesson?.kind === "mock" ? card?.storySoFar : undefined);

  const goNext = async () => {
    if (next) await navigate({ to: "/app/day/$day/$lesson", params: { day: data.day, lesson: next.id } });
    else await navigate({ to: "/app" });
  };

  const save = async () => {
    if (!lesson) return;
    if (scoredEntry !== null && scoredEntry === JSON.stringify(entry)) {
      await goNext();
      return;
    }
    const missing = missingParts(lesson, entry, data.model.behaviours);
    setErrors(missing);
    if (Object.keys(missing).length > 0) {
      setFooterError("Fill in the highlighted parts first.");
      return;
    }
    setFooterError("");
    setSaving(true);
    try {
      const saved = await saveLesson(data.day, lesson.id, entry);
      queryClient.setQueryData<DayViewResponse>(learningKeys.day(data.day), (view) =>
        view
          ? { ...view, progress: view.progress.map((item) => (item.id === saved.id ? saved : item)) }
          : view,
      );
      // The next lesson unlocks (and, after the last one, the quiz) on the server: refetch before moving on.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: learningKeys.day(data.day), exact: true }),
        queryClient.invalidateQueries({ queryKey: learningKeys.course }),
      ]);
      void queryClient.invalidateQueries({ queryKey: learningKeys.plan });
      void queryClient.invalidateQueries({ queryKey: learningKeys.home });
      if (stayAfterSave(saved)) {
        // Stay to show the AI feedback; Next then moves on.
        setScoredEntry(JSON.stringify(entry));
        requestAnimationFrame(() => {
          feedbackRef.current?.focus();
        });
        return;
      }
      await goNext();
    } catch (error) {
      if (error instanceof ApiError && error.code === "VALIDATION" && error.body.fields) {
        const mapped = mapFieldErrors(error.body.fields);
        setErrors(mapped);
        // Ticks and rounds have no inline place for a message: show those in the footer.
        const other = ["checked", "rounds"].flatMap((key) => (mapped[key] ? [mapped[key]] : []));
        setFooterError(other.length > 0 ? other.join(" ") : "Fill in the highlighted parts first.");
      } else setFooterError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const ratingsFirst = lesson?.kind === "scorecard" || lesson?.kind === "rate";
  const blocks = lesson
    ? lesson.blocks.map((block, at) =>
        block.type === "field" ? (
          <InlineField key={`field-${block.id}`} id={block.id} {...{ lesson, entry, setEntry, errors }} />
        ) : (
          <LessonBlock
            // Blocks have no ids; their order is fixed by the content file.
            // eslint-disable-next-line @eslint-react/no-array-index-key
            key={at}
            block={block}
            model={data.model}
            recalls={data.recalls}
            pillarNow={data.pillarNow}
          />
        ),
      )
    : null;

  return (
    <>
      <article aria-labelledby="lesson-title" className={articleClass}>
        <div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted tabular-nums">
            <span>{kicker(data.day, index, items.length, current, lesson?.minutes)}</span>
            {round ? <Badge tone="info">{round}</Badge> : null}
          </p>
          <h1 id="lesson-title" className="mt-1 text-title font-bold">
            {lesson?.heading ?? current.title}
          </h1>
        </div>
        {locked ? (
          <LockedLesson data={data} isQuiz={isQuiz} />
        ) : isQuiz ? (
          <QuizLesson data={data} course={course} />
        ) : lesson ? (
          <>
            {lead ? <Markdown className="max-w-prose text-md text-fg-2">{lead}</Markdown> : null}
            {/* Ratings come first (Friday scorecard, Day-1 baseline); their notes follow them. */}
            {ratingsFirst ? null : blocks}
            {lesson.kind === "mock" ? <MockCard day={data.day} lesson={lesson} card={card} /> : null}
            {lesson.kind === "live" ? (
              <LiveCall
                day={data.day}
                lesson={lesson}
                card={card}
                plan={data.livePlan}
                entry={entry}
                setEntry={setEntry}
                error={errors.livePath}
              />
            ) : null}
            {lesson.fields.length > 0 && lesson.source !== "carebook" ? (
              <Notice>{safetyReminders(lesson.source).join(" ")}</Notice>
            ) : null}
            <LessonInputs
              inputs={{ lesson, entry, setEntry, errors }}
              model={data.model}
              baseline={data.baseline}
              weekStats={data.weekStats}
            />
            <RealProjectCheck lesson={lesson} entry={entry} setEntry={setEntry} />
            {ratingsFirst ? blocks : null}
            {scoredEntry !== null && state?.aiScore ? (
              <WriteFeedback headingRef={feedbackRef} score={state.aiScore} modelAnswer={state.modelAnswer} />
            ) : null}
          </>
        ) : null}
      </article>

      <div className="sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-line bg-bg px-4 py-3 lg:px-12 lg:py-3.5">
        {previous ? (
          <Link
            to="/app/day/$day/$lesson"
            params={previous}
            preload={false}
            className={buttonVariants({ size: "lg", className: "shrink-0" })}
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            <span className="max-sm:sr-only">Previous</span>
          </Link>
        ) : previousGate ? (
          <Link
            to="/app/gate/$gate"
            params={{ gate: previousGate.gate }}
            className={buttonVariants({ size: "lg", className: "shrink-0" })}
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            <span className="max-sm:sr-only">Previous</span>
          </Link>
        ) : previousAssessment ? (
          <Link
            to="/app/assessment/$day"
            params={{ day: previousAssessment }}
            className={buttonVariants({ size: "lg", className: "shrink-0" })}
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            <span className="max-sm:sr-only">Previous</span>
          </Link>
        ) : (
          <span className="w-10 shrink-0" />
        )}
        <span className="hidden min-w-0 truncate text-center text-sm text-muted tabular-nums md:block">
          Day {data.day} · {data.storyDate} · Lesson {index + 1} of {items.length}
        </span>
        <div className="flex min-w-0 flex-col items-end gap-1">
          {footerError ? (
            <span role="alert" className="text-sm text-danger">
              {footerError}
            </span>
          ) : null}
          {isQuiz ? (
            data.quiz.status === "done" ? (
              assessment ? (
                <Link
                  to="/app/assessment/$day"
                  params={{ day: data.day }}
                  className={buttonVariants({ variant: "primary", size: "lg", className: "max-w-full" })}
                >
                  <span className="truncate">Next: Week {assessmentWeek(data.day)} assessment</span>
                  <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
                </Link>
              ) : dayOpen(nextDay) ? (
                <Link
                  to="/app/day/$day"
                  params={{ day: data.day + 1 }}
                  preload={false}
                  className={buttonVariants({ variant: "primary", size: "lg", className: "max-w-full" })}
                >
                  <span className="truncate">
                    Finish Day {data.day} → Day {data.day + 1}
                  </span>
                </Link>
              ) : (
                <Link to="/app" className={buttonVariants({ variant: "primary", size: "lg" })}>
                  Finish Day {data.day} ✓
                </Link>
              )
            ) : null
          ) : locked ? null : (
            <Button
              variant="primary"
              size="lg"
              className="max-w-full"
              disabled={saving}
              onClick={() => {
                void save();
              }}
            >
              <span className="truncate">
                {saving ? "Saving…" : next ? `Next: ${next.title}` : `Finish Day ${data.day}`}
              </span>
              {saving ? null : <ArrowRight aria-hidden="true" className="size-4 shrink-0" />}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

function LessonInputs({
  inputs,
  model,
  baseline,
  weekStats,
}: {
  inputs: React.ComponentProps<typeof Fields>;
  model: DayViewResponse["model"];
  baseline: DayViewResponse["baseline"];
  weekStats: DayViewResponse["weekStats"];
}) {
  if (inputs.lesson.scorecard.length > 0)
    // Friday scorecard: pillars with proof, the self-check ticks, then the win / stuck notes.
    return (
      <>
        <Scorecard {...inputs} model={model} baseline={baseline} weekStats={weekStats} />
        <Checks {...inputs} />
        <ScorecardNotes {...inputs} />
        <Fields {...inputs} skip={scorecardFieldIds(model)} />
      </>
    );
  const rates = inputs.lesson.baseline;
  return (
    <>
      {/* A rating lesson rates first, then asks its questions (e.g. the Day-1 goals). */}
      {rates ? null : <Fields {...inputs} />}
      <Checks {...inputs} />
      <Rounds {...inputs} />
      <Rubric {...inputs} model={model} />
      <Baseline {...inputs} model={model} />
      {rates ? <Fields {...inputs} /> : null}
    </>
  );
}

/** A saved write lesson's AI feedback, with the model answer folded to compare. */
function WriteFeedback({
  headingRef,
  score,
  modelAnswer,
}: {
  headingRef: React.Ref<HTMLHeadingElement>;
  score: NonNullable<DayViewResponse["progress"][number]["aiScore"]>;
  modelAnswer: string | null;
}) {
  return (
    <section aria-labelledby="feedback-title" className={cn(panelClass, "flex flex-col gap-3.5")}>
      <h2 id="feedback-title" ref={headingRef} tabIndex={-1} className="text-lg outline-none">
        Your feedback
      </h2>
      <AiFeedback score={score} />
      {modelAnswer ? (
        <Collapsible title="Model answer" aside="to compare">
          <Markdown className="text-base text-fg-2">{modelAnswer}</Markdown>
        </Collapsible>
      ) : null}
    </section>
  );
}

function LockedLesson({ data, isQuiz }: { data: DayViewResponse; isQuiz: boolean }) {
  const open = startItem(data);
  return (
    <>
      <Notice tone="info">
        {isQuiz
          ? "Finish today's lessons first. The daily quiz comes last."
          : "Finish the lessons before this one first."}
      </Notice>
      {open ? (
        <div>
          <Link
            to="/app/day/$day/$lesson"
            params={{ day: data.day, lesson: open }}
            className={buttonVariants({ variant: "primary", size: "lg" })}
          >
            Go to the next open lesson
          </Link>
        </div>
      ) : null}
    </>
  );
}

/** The item before this one: in the same day, else the previous day's last item (if it can be opened). */
function previousTarget(
  data: DayViewResponse,
  course: CourseOutlineResponse | undefined,
  items: PlayerItem[],
  index: number,
): { day: number; lesson: string } | null {
  const before = items[index - 1];
  if (before) return { day: data.day, lesson: before.id };
  const previousDay = outlineDay(course, data.day - 1);
  if (!previousDay || !dayOpen(previousDay)) return null;
  const last = lastItemOf(previousDay);
  return last ? { day: previousDay.day, lesson: last } : null;
}
