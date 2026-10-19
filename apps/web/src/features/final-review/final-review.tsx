import {
  FINAL_OUTCOME_TEXT,
  FINAL_OUTCOMES,
  type FinalOutcome,
  type FinalReviewResult,
  type FinalStatus,
  LIVE_ROLE_LABELS,
  type LiveCallRow,
  type LivePath,
} from "@portal/contracts";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { CriteriaList } from "@/features/gates/gate-result";
import { averageText, formatDateTime } from "@/features/gates/gates";
import { RagBadge } from "@/features/manager/rag-badge";

/** Final review decisions as pills: green only for Client-ready (Done/Passed colour rule). */
const OUTCOME_TONE: Record<FinalOutcome, "success" | "info" | "warning"> = {
  client_ready: "success",
  light_support: "info",
  another_cycle: "warning",
};

export function FinalOutcomeBadge({ outcome }: { outcome: FinalOutcome }) {
  return (
    <Badge tone={OUTCOME_TONE[outcome]} dot>
      {FINAL_OUTCOME_TEXT[outcome].label}
    </Badge>
  );
}

/** Status wording: the engineer's ("Book it") and the manager's ("To book"). */
export const FINAL_STATUS_LABEL: Record<FinalStatus, { engineer: string; manager: string }> = {
  locked: { engineer: "Opens after Day 64", manager: "Not reached" },
  to_book: { engineer: "Book it", manager: "To book" },
  recorded: { engineer: "Recorded", manager: "Recorded" },
};

/** The three decisions with their bar and what happens next (PDF word for word). */
export function FinalBars() {
  return (
    <ul className="flex flex-col gap-1.5 text-base">
      {FINAL_OUTCOMES.map((outcome) => (
        <li key={outcome}>
          <b className="font-semibold">{FINAL_OUTCOME_TEXT[outcome].label}</b>{" "}
          <span className="text-fg-2">
            ({FINAL_OUTCOME_TEXT[outcome].bar}) → {FINAL_OUTCOME_TEXT[outcome].next}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A recorded final review: the call, the numbers, the criteria, the rating and note. */
export function FinalResultDetails({ result }: { result: FinalReviewResult }) {
  return (
    <>
      <dl className="kv">
        <dt>Observed call</dt>
        <dd>
          {result.call} · {result.observer === "pm" ? "PM" : "Manager"} observed
        </dd>
        <dt>Held</dt>
        <dd className="tabular-nums">{formatDateTime(result.heldAt)}</dd>
        <dt>Scored</dt>
        <dd className="tabular-nums">{result.scored} of 11</dd>
        <dt>Average</dt>
        <dd className="tabular-nums">{averageText(result.average)}</dd>
        <dt>Lowest</dt>
        <dd className="tabular-nums">{result.lowest ?? "—"}</dd>
        <dt>Rating</dt>
        <dd>
          <RagBadge rag={result.rag} />
        </dd>
        <dt>Note</dt>
        <dd>{result.note}</dd>
        <dt>Recorded by</dt>
        <dd>{result.by.name}</dd>
      </dl>
      <CriteriaList result={result} />
    </>
  );
}

/** What happened on a live-call day, in the manager's words. */
const MANAGER_PATH_LABELS: Record<LivePath, string> = {
  had_call: "Had the live call",
  shadowed_other: "Joined another team's call",
  later: "Scheduled for later",
  substitute: "Substitute mock",
};

/** The Phase 3 live-call days: role and what happened (the call sheets stay private). */
export function LiveCallsCard({ liveCalls }: { liveCalls: readonly LiveCallRow[] }) {
  if (liveCalls.length === 0) return null;
  return (
    <Card>
      <CardHeader title="Live calls" aside="Phase 3" />
      <CardBody className="gap-0 py-2">
        <ul className="flex flex-col">
          {liveCalls.map((row) => (
            <li
              key={row.day}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line py-2 text-base first:border-t-0"
            >
              <span className="w-14 shrink-0 font-medium tabular-nums">Day {row.day}</span>
              <span className="min-w-0 flex-1 text-fg-2">{LIVE_ROLE_LABELS[row.role]}</span>
              {row.deferred && row.path !== "later" ? <Badge tone="neutral">Was deferred</Badge> : null}
              {row.path ? (
                <Badge tone={row.path === "later" || row.path === "substitute" ? "warning" : "neutral"}>
                  {MANAGER_PATH_LABELS[row.path]}
                </Badge>
              ) : (
                <span className="text-sm text-muted">Not reached</span>
              )}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
