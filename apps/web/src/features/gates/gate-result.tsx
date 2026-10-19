import { type FollowUpType, type GateNo, type GateResult, type GateStatus } from "@portal/contracts";
import { Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Collapsible } from "@/components/ui/collapsible";
import { RagBadge } from "@/features/manager/rag-badge";
import { cn } from "@/lib/cn";
import {
  averageText,
  criterionText,
  followUpText,
  formatDateTime,
  GATE_STATUS_PILL,
  OUTCOME_LABEL,
  OUTCOME_TONE,
  repeatWeeksText,
} from "./gates";
import { GATE_RUBRIC } from "./rubric";

/** A gate status as a pill (manager wording; the engineer page passes its own label). */
export function GateStatusBadge({ status, label }: { status: GateStatus; label?: string }) {
  const pill = GATE_STATUS_PILL[status];
  return (
    <Badge tone={pill.tone} dot={pill.dot}>
      {label ?? pill.label}
    </Badge>
  );
}

export function OutcomeBadge({ outcome }: { outcome: GateResult["outcome"] }) {
  return (
    <Badge tone={OUTCOME_TONE[outcome]} dot>
      {OUTCOME_LABEL[outcome]}
    </Badge>
  );
}

/**
 * Scored · Average · Lowest, then Gate 1's recap time, or Gate 2's healthcare terms (✓/✗) and written
 * follow-up type.
 */
export function GateNumbers({
  result,
  gate = 1,
  followUpType = null,
}: {
  result: GateResult;
  gate?: GateNo;
  followUpType?: FollowUpType | null;
}) {
  return (
    <dl className="kv">
      <dt>Scored</dt>
      <dd className="tabular-nums">{result.scored} of 11</dd>
      <dt>Average</dt>
      <dd className="tabular-nums">{averageText(result.average)}</dd>
      <dt>Lowest</dt>
      <dd className="tabular-nums">{result.lowest ?? "—"}</dd>
      {gate === 2 ? (
        <>
          <dt>Healthcare terms</dt>
          <dd className="flex items-center gap-1.5">
            {result.healthcareTerms ? (
              <>
                <Check aria-hidden="true" className="size-4 shrink-0 text-success" />
                Used correctly
              </>
            ) : (
              <>
                <X aria-hidden="true" className="size-4 shrink-0 text-danger" />
                Not yet used correctly
              </>
            )}
          </dd>
          <dt>Written follow-up</dt>
          <dd>{followUpText(followUpType)}</dd>
        </>
      ) : (
        <>
          <dt>Recap</dt>
          <dd>{result.recapOnTime ? "Within 2 hours" : "Not within 2 hours"}</dd>
        </>
      )}
    </dl>
  );
}

/** Gate 2's Phase 3 live-call plan (which real calls to shadow, co-lead and lead). Nothing without one. */
export function LiveCallPlan({ result, title }: { result: GateResult; title: string }) {
  if (!result.liveCallPlan) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium text-fg-2">{title}</span>
      <p className="text-base whitespace-pre-wrap tabular-nums">{result.liveCallPlan}</p>
    </div>
  );
}

/** Criteria 1–11 with their scores (n/a for what didn't come up). */
export function CriteriaList({ result }: { result: Pick<GateResult, "criteria"> }) {
  return (
    <ol aria-label="Call rubric scores" className="flex flex-col text-base">
      {GATE_RUBRIC.map((criterion) => {
        const score = result.criteria[String(criterion.number)];
        return (
          <li
            key={criterion.number}
            className="flex items-center justify-between gap-3 border-t border-line py-1.5 first:border-t-0"
          >
            <span className="min-w-0">
              {criterion.number}. {criterion.name}
            </span>
            <span
              className={cn(
                "shrink-0 font-medium tabular-nums",
                score === 1 && "text-danger",
                (score === null || score === undefined) && "font-normal text-muted",
              )}
            >
              {criterionText(score)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** The manager's rating, note, focus items or repeat blocks. */
export function GateOutcomeDetails({ result }: { result: GateResult }) {
  return (
    <div className="flex flex-col gap-2 text-base">
      {result.focusItems.length > 0 ? (
        <div>
          <span className="text-sm font-medium text-fg-2">Focus for the next weeks</span>
          <ul className="list-disc pl-5">
            {result.focusItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {result.repeatWeeks.length > 0 ? (
        <p>
          <span className="text-sm font-medium text-fg-2">Repeat: </span>
          {repeatWeeksText(result.repeatWeeks)}
        </p>
      ) : null}
      <p className="flex flex-wrap items-center gap-2">
        <RagBadge rag={result.rag} short />
        <span className="text-fg-2">“{result.note}”</span>
      </p>
      <p className="text-sm text-muted tabular-nums">
        {result.by.name} · held {formatDateTime(result.heldAt)}
      </p>
    </div>
  );
}

/** Earlier rounds, folded (newest first). */
export function GateHistory({ history }: { history: GateResult[] }) {
  if (history.length === 0) return null;
  return (
    <Collapsible
      title="Earlier rounds"
      aside={`${history.length} ${history.length === 1 ? "round" : "rounds"}`}
    >
      <ul className="flex flex-col gap-4">
        {history.map((result) => (
          <li key={result.round} className="flex flex-col gap-2">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
              Round {result.round}
              <OutcomeBadge outcome={result.outcome} />
              <span className="font-normal text-muted tabular-nums">
                Average {averageText(result.average)} · lowest {result.lowest ?? "—"}
              </span>
            </p>
            <LiveCallPlan result={result} title="Phase 3 live-call plan" />
            <GateOutcomeDetails result={result} />
          </li>
        ))}
      </ul>
    </Collapsible>
  );
}
