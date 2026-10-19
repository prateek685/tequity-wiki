import { type AiScore, type PointVerdict } from "@portal/contracts";
import { cva } from "class-variance-authority";
import { Check, LoaderCircle, Minus, TriangleAlert, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/page-header";
import { cn } from "@/lib/cn";
import { scoreLabel, VERDICT_TEXT } from "../ai-score";
import { labelClass } from "./blocks";

/**
 * The AI feedback on one written answer (daily quiz, assessment, write lessons), in every state:
 * being scored → the score, the scoring points, the reason and a better sentence. The text is private
 * to the engineer. Progress never waits for it.
 */

const verdictIcon = cva("mt-0.5 size-4 shrink-0", {
  variants: {
    verdict: { met: "text-success", partly: "text-warning", not_met: "text-danger" },
  },
});

const VERDICT_ICON: Record<PointVerdict, typeof Check> = { met: Check, partly: Minus, not_met: X };

export function AiFeedback({
  score,
  className,
  manager = false,
}: {
  score: AiScore;
  className?: string;
  /** Shown to the engineer's manager (answer review): wording about "the answer", not "your answer". */
  manager?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {score.possiblePhi ? (
        <Notice tone="warning" className="flex items-start gap-2">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            {manager
              ? "The answer may include patient details. Remind the engineer to use made-up names and numbers."
              : "Your answer may include patient details. In practice, use made-up names and numbers."}
          </span>
        </Notice>
      ) : null}
      <AiFeedbackBody score={score} manager={manager} />
    </div>
  );
}

function AiFeedbackBody({ score, manager }: { score: AiScore; manager: boolean }) {
  switch (score.status) {
    case "pending":
      return (
        <p role="status" className="flex items-start gap-2.5 text-base text-fg-2">
          <LoaderCircle
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-muted motion-safe:animate-spin"
          />
          <span>
            <b className="font-medium">Being scored…</b>{" "}
            <span className="text-muted">
              {manager
                ? "Usually under a minute. You can review it once the AI score is in."
                : "Usually under a minute. You can move on; the feedback stays here."}
            </span>
          </span>
        </p>
      );
    case "failed":
      return (
        <Notice>
          {manager
            ? "The AI couldn't score this answer. Give it your own score."
            : "We couldn't score this answer. It's saved, and your progress isn't affected."}
        </Notice>
      );
    case "not_scored":
      return <Notice>AI feedback isn&apos;t available for real-project answers yet.</Notice>;
    case "scored":
      return <Scored score={score} />;
  }
}

function Scored({ score }: { score: AiScore }) {
  const label = scoreLabel(score);
  return (
    <section
      aria-label="AI feedback"
      className="flex flex-col gap-3 rounded-ctl border border-line bg-surface p-3.5 text-base"
    >
      <div className="flex items-center justify-between gap-3">
        <span className={labelClass}>AI feedback</span>
        {label ? (
          <Badge className="text-sm tabular-nums">
            <span className="sr-only">Score </span>
            {label}
          </Badge>
        ) : null}
      </div>
      {score.points.length > 0 ? (
        <ul className="flex flex-col gap-1.5" aria-label="Scoring points">
          {score.points.map((point) => {
            const Icon = VERDICT_ICON[point.verdict];
            return (
              <li key={point.point} className="flex items-start gap-2">
                <Icon aria-hidden="true" className={verdictIcon({ verdict: point.verdict })} />
                <span className="min-w-0">
                  {point.point}
                  <span className="text-sm text-muted"> · {VERDICT_TEXT[point.verdict]}</span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {score.reason ? <p className="text-fg-2">{score.reason}</p> : null}
      {score.betterSentence ? (
        <div className="flex flex-col gap-1.5">
          <span className={labelClass}>A better way to say it</span>
          <div className="rounded-card bg-success-soft px-3.5 py-3 text-read">{score.betterSentence}</div>
        </div>
      ) : null}
    </section>
  );
}
