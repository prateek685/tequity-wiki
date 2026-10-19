import { type CourseOutlineResponse, type DayViewResponse, type QuizViewResponse } from "@portal/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CircleCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/page-header";
import { errorMessage } from "@/lib/api";
import { assessmentAfter, DAYS_PER_WEEK } from "../assessment";
import { QUIZ_MESSAGES } from "../plan";
import { learningKeys, quizQuery } from "../queries";
import { QuizReview, QuizRunner } from "../quiz";
import { panelClass } from "./blocks";

/** The daily quiz inside the player: start or resume, one question at a time, then the review. */
export function QuizLesson({
  data,
  course,
}: {
  data: DayViewResponse;
  course: CourseOutlineResponse | undefined;
}) {
  const status = data.quiz.status;
  // Starting is a POST, so a ready quiz waits for a click; an open attempt resumes straight away.
  const [started, setStarted] = useState(status === "in_progress");

  if (status === "done") return <QuizDone data={data} course={course} />;
  if (status === "ready" && !started)
    return (
      <div className={`${panelClass} flex flex-col items-start gap-3`}>
        <p className="text-read text-fg-2">{QUIZ_MESSAGES.ready}</p>
        <p className="text-sm text-muted">
          One question at a time. Each answer is final and shows its explanation straight away.
        </p>
        <Button
          variant="primary"
          size="lg"
          onClick={() => {
            setStarted(true);
          }}
        >
          Start the quiz
        </Button>
      </div>
    );
  if (status === "ready" || status === "in_progress") return <QuizSession day={data.day} />;
  return <Notice tone="info">{QUIZ_MESSAGES[status]}</Notice>;
}

function QuizSession({ day }: { day: number }) {
  const queryClient = useQueryClient();
  const quiz = useQuery(quizQuery(day));
  if (quiz.isPending)
    return (
      <p role="status" className="text-sm text-muted">
        Loading the quiz…
      </p>
    );
  if (quiz.isError) return <Notice tone="warning">{errorMessage(quiz.error)}</Notice>;
  return (
    <QuizRunner
      quiz={quiz.data}
      onAnswered={async (position, result) => {
        // A poll in flight (another answer being scored) must not overwrite this answer.
        await queryClient.cancelQueries({ queryKey: learningKeys.quiz(day), exact: true });
        queryClient.setQueryData<QuizViewResponse>(learningKeys.quiz(day), (current) =>
          current
            ? {
                ...current,
                items: current.items.map((entry) =>
                  entry.position === position ? { ...entry, result } : entry,
                ),
              }
            : current,
        );
      }}
      onFinished={() => {
        // The day view turns the quiz "done", which shows the finish note and the review.
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: learningKeys.day(day), exact: true }),
          queryClient.invalidateQueries({ queryKey: learningKeys.day(day + 1), exact: true }),
          queryClient.invalidateQueries({ queryKey: learningKeys.course }),
          queryClient.invalidateQueries({ queryKey: learningKeys.plan }),
          queryClient.invalidateQueries({ queryKey: learningKeys.home }),
        ]);
      }}
    />
  );
}

/**
 * Finished: "Day N is done", then the answers. A week's last day points on to the weekly assessment
 * (its result screen says "That's Week N."); Week 13 has no assessment and ends here.
 */
function QuizDone({ data, course }: { data: DayViewResponse; course: CourseOutlineResponse | undefined }) {
  const quiz = useQuery(quizQuery(data.day));
  const assessment = assessmentAfter(course, data.day);
  const week = data.block.number;
  const weekDone = data.day === week * DAYS_PER_WEEK && !assessment;
  const nextWeek = course?.weeks.find((entry) => entry.number === week + 1);
  return (
    <>
      <div role="status" className="flex items-center gap-4 rounded-card bg-success-soft px-4.5 py-4">
        <CircleCheck aria-hidden="true" className="size-6 shrink-0 text-success" />
        <span>
          <b className="block font-semibold">
            {weekDone ? `That's Week ${week}.` : `Day ${data.day} is done.`}
          </b>
          <span className="text-base text-fg-2">
            {weekDone
              ? `Day ${data.day} is done.${nextWeek ? ` Next week: ${nextWeek.title}.` : ""}`
              : "Well done."}{" "}
            AI feedback on written answers shows below.
          </span>
        </span>
      </div>
      {assessment ? (
        <AssessmentNext week={week} day={data.day} passed={assessment.status === "passed"} />
      ) : null}
      <h2 className="-mb-3.5 text-lg">Your answers</h2>
      {quiz.isPending ? (
        <p role="status" className="text-sm text-muted">
          Loading your answers…
        </p>
      ) : quiz.isError ? (
        <Notice tone="warning">{errorMessage(quiz.error)}</Notice>
      ) : (
        <QuizReview quiz={quiz.data} />
      )}
    </>
  );
}

/** "One more step this week: the Week N assessment. Pass it to open Day N+1." */
function AssessmentNext({ week, day, passed }: { week: number; day: number; passed: boolean }) {
  return (
    <div className="flex items-start gap-2.5 rounded-card bg-info-soft px-3.5 py-3 text-base">
      <ArrowRight aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-info" />
      <span className="min-w-0">
        {passed ? (
          <>
            <b className="font-semibold">You passed the Week {week} assessment.</b>{" "}
            <Link
              to="/app/assessment/$day"
              params={{ day }}
              className="font-medium text-accent-text underline underline-offset-2"
            >
              See your result
            </Link>
          </>
        ) : (
          <>
            <b className="font-semibold">One more step this week:</b> the{" "}
            <Link
              to="/app/assessment/$day"
              params={{ day }}
              className="font-medium text-accent-text underline underline-offset-2"
            >
              Week {week} assessment
            </Link>
            . Pass it to open Day {day + 1}.
          </>
        )}
      </span>
    </div>
  );
}
