import {
  type CourseOutlineResponse,
  FOLLOW_UP_LABELS,
  type FollowUpType,
  GATE_BARS,
  GATE_WEEKS,
  type GateNo,
  type GateOutcome,
  type GateSummary,
  type GateResult,
  type GateStatus,
  type GateViewResponse,
  RECAP_MINUTES,
} from "@portal/contracts";
import { blockDays } from "@/features/learning/plan";

/**
 * Gate screens (docs/PORTAL_PLAN.md §2–§3, docs/design/final-mockup.html `gate()`). The maths and the pass
 * bar live in @portal/contracts (`gateMaths`, `meetsBar`, …); these are display rules. Pure: unit-tested.
 */

export type GateTone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

/** Status pill per gate status (engineer and manager wording). Green only for passed. */
export const GATE_STATUS_PILL: Record<GateStatus, { label: string; tone: GateTone; dot: boolean }> = {
  locked: { label: "Not reached", tone: "neutral", dot: false },
  to_book: { label: "To book", tone: "warning", dot: true },
  recap_sent: { label: "To record", tone: "accent", dot: false },
  passed: { label: "Passed", tone: "success", dot: true },
  passed_focus: { label: "Passed · focus", tone: "success", dot: true },
  repeat: { label: "Repeating blocks", tone: "warning", dot: false },
  rerun: { label: "Re-run to book", tone: "warning", dot: true },
};

/** The engineer's wording for "recap_sent" (they wait; the manager records). */
export function engineerStatusLabel(status: GateStatus): string {
  return status === "recap_sent" ? "Recap sent" : GATE_STATUS_PILL[status].label;
}

/** Statuses that need the manager (the Gates menu badge): book, record, or re-run. */
export function needsManager(status: GateStatus): boolean {
  return status === "to_book" || status === "recap_sent" || status === "rerun";
}

export const OUTCOME_LABEL: Record<GateOutcome, string> = {
  pass: "Pass",
  pass_focus: "Pass with focus areas",
  repeat: "Repeat 2 focus blocks",
};

export const OUTCOME_TONE: Record<GateOutcome, GateTone> = {
  pass: "success",
  pass_focus: "success",
  repeat: "warning",
};

/** "Round 2" for a repeated day (round > 1), else null. */
export function roundBadge(round: number): string | null {
  return round > 1 ? `Round ${round}` : null;
}

/** "Round 2 · repeat" next to a repeated day's label, else null. */
export function roundLabel(round: number): string | null {
  return round > 1 ? `Round ${round} · repeat` : null;
}

/** The gate that follows this day in the outline (Day 20 → Gate 1), else null. */
export function gateAfter(
  course: Pick<CourseOutlineResponse, "weeks"> | undefined,
  day: number,
): GateSummary | null {
  return course?.weeks.find((week) => week.gate?.afterDay === day)?.gate ?? null;
}

/** "Days 6–10" for a week. */
export function weekDays(week: number): string {
  const { first, last } = blockDays(week);
  return `Days ${first}–${last}`;
}

/** "Days 6–10, 11–15" for the repeat weeks (sorted). Empty string for none. */
export function repeatWeeksText(weeks: readonly number[]): string {
  const ranges = [...weeks]
    .sort((a, b) => a - b)
    .map((week) => {
      const { first, last } = blockDays(week);
      return `${first}–${last}`;
    });
  return ranges.length === 0 ? "" : `Days ${ranges.join(", ")}`;
}

/** "Days 6–10 and 11–15" (engineer wording). */
export function repeatWeeksSentence(weeks: readonly number[]): string {
  const ranges = [...weeks]
    .sort((a, b) => a - b)
    .map((week) => {
      const { first, last } = blockDays(week);
      return `${first}–${last}`;
    });
  if (ranges.length === 0) return "";
  if (ranges.length === 1) return `Days ${ranges[0] ?? ""}`;
  return `Days ${ranges.slice(0, -1).join(", ")} and ${ranges.at(-1) ?? ""}`;
}

const MINUTE_MS = 60_000;

/**
 * The recap counts as on time when it arrived no later than RECAP_MINUTES after the call (a recap sent
 * before the recorded time also counts). False without a recap or with an unreadable time.
 */
export function recapOnTime(submittedAt: string | null | undefined, heldAt: string | null): boolean {
  if (!submittedAt || !heldAt) return false;
  const sent = Date.parse(submittedAt);
  const held = Date.parse(heldAt);
  if (Number.isNaN(sent) || Number.isNaN(held)) return false;
  return sent - held <= RECAP_MINUTES * MINUTE_MS;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** "Held at" as the date and time inputs show it, in the viewer's time zone (default: now). */
export function heldAtParts(at: Date = new Date()): { date: string; time: string } {
  return {
    date: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
    time: `${pad(at.getHours())}:${pad(at.getMinutes())}`,
  };
}

/** The date + time inputs (local time) as an ISO date-time, or null when either is missing or invalid. */
export function heldAtIso(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const at = new Date(`${date}T${time}:00`);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

/** The live outcome pill on the gate form (mockup `gate()`). */
export function barPill(meets: boolean | null): { label: string; tone: GateTone; dot: boolean } {
  if (meets === null) return { label: "Score at least one criterion", tone: "neutral", dot: false };
  return meets
    ? { label: "Meets the pass bar", tone: "success", dot: true }
    : { label: "Below the pass bar", tone: "danger", dot: true };
}

/** The outcome the form suggests: pass at or above the bar, repeat below it. */
export function suggestedOutcome(meets: boolean | null): GateOutcome {
  return meets === false ? "repeat" : "pass";
}

/** True when the outcome goes against the pass bar: a pass below it, or a repeat at or above it. */
export function againstBar(outcome: GateOutcome, meets: boolean | null): boolean {
  if (meets === null) return false;
  return meets ? outcome === "repeat" : outcome !== "repeat";
}

/** Two decimals ("2.73") or "—". */
export function averageText(average: number | null): string {
  return average === null ? "—" : average.toFixed(2);
}

/** A criterion's score as text: "4", or "n/a" when it didn't come up. */
export function criterionText(score: number | null | undefined): string {
  return score === null || score === undefined ? "n/a" : String(score);
}

const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** "10 Oct, 14:05" in the viewer's time zone. */
export function formatDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}

/** One line for My plan's gate row, by status (the result's outcome is shown as a pill instead). */
export function planGateDetail(status: GateStatus, afterDay: number): string {
  switch (status) {
    case "locked":
      return `Opens once Day ${afterDay} is done · Day ${afterDay + 1} opens after a pass`;
    case "to_book":
      return "Book it with your manager · 45 min live call";
    case "recap_sent":
      return "Recap sent · waiting for your manager to record the result";
    case "passed":
    case "passed_focus":
      return `Passed · Day ${afterDay + 1} is open`;
    case "repeat":
      return "Repeat 2 focus blocks, then the gate runs again";
    case "rerun":
      return "Book it again with your manager · 45 min live call";
  }
}

/** The outline row's short hint. */
export function outlineGateHint(status: GateStatus): string {
  switch (status) {
    case "to_book":
      return "Book it";
    case "recap_sent":
      return "Recap sent";
    case "passed":
    case "passed_focus":
      return "Passed";
    case "repeat":
      return "Repeat";
    case "rerun":
      return "Book again";
    default:
      return "";
  }
}

/** The recap is required to be at least 20 characters (contracts `saveGateRecapRequest`). */
export function recapOk(text: string): boolean {
  return text.trim().length >= 20;
}

/**
 * The result to show: this round's, or (while repeating, when the API has already moved to the next
 * round) the newest earlier one. `earlier` leaves out the one shown.
 */
export function shownResult(view: Pick<GateViewResponse, "status" | "result" | "history">): {
  result: GateResult | null;
  earlier: GateResult[];
} {
  if (view.result) return { result: view.result, earlier: view.history };
  if (view.status === "repeat" && view.history[0])
    return { result: view.history[0], earlier: view.history.slice(1) };
  return { result: null, earlier: view.history };
}

// ── Gate 1 / Gate 2 copy and checks ─────────────────────────────────────────────────────────────

/** A gate number from the API as the contract's 1 | 2 (anything but 2 is Gate 1). */
export function asGateNo(gate: number): GateNo {
  return gate === 2 ? 2 : 1;
}

/** "Weeks 1–4" / "Weeks 5–8": the weeks a gate covers. */
export function gateWeeksText(gate: GateNo): string {
  const weeks = GATE_WEEKS[gate];
  return `Weeks ${weeks[0] ?? ""}–${weeks.at(-1) ?? ""}`;
}

/** "Pass: average ≥ 3.0, no criterion below 2, …" (the PDF's bar, word for word after "Pass: "). */
export function passLine(gate: GateNo): string {
  const text = GATE_BARS[gate].text;
  return `Pass: ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

/** Portal-native wording per gate (no section references). */
export const GATE_COPY: Record<
  GateNo,
  {
    /** Engineer page: the opening line (before "Pass it and Day N opens."). */
    intro: string;
    scenario: string;
    call: string;
    afterwards: string;
    /** The Passed banner, after "Day N is open." when there are no focus items. */
    next: string;
    /** Manager form: the Scenario card's aside, the rubric card's aside, and a placeholder. */
    scenarioAside: string;
    rubricAside: string;
    surprisePlaceholder: string;
    /** The mock card the form starts on (the PDF's example for Gate 1), else the first card. */
    defaultCard: string | null;
  }
> = {
  1: {
    intro: "Gate 1 is your first real check: one live client call, watched by your manager.",
    scenario:
      "Your manager picks a Phase 1 scenario you haven't practised, with one surprise added. You won't know it beforehand.",
    call: "You run it live with the AI client for 20 minutes, on speaker or screen share, while your manager watches. They may join as a second stakeholder.",
    afterwards: "Send the written recap within 2 hours, here on this page.",
    next: "Phase 2 starts there.",
    scenarioAside: "An unseen Phase 1 scenario + one surprise",
    rubricAside: "20-min unseen Phase 1 scenario + surprise",
    surprisePlaceholder: "e.g. Dana asks to move the pilot a week earlier",
    defaultCard: "S12",
  },
  2: {
    intro:
      "Gate 2 checks you're ready for real client calls: one live healthcare scenario, watched by your manager.",
    scenario:
      "Your manager picks a healthcare scenario that combines discovery, a risk or a piece of bad news, and pushback. You won't know it beforehand.",
    call: "You run it live with the AI client for 25 minutes, on speaker or screen share, while your manager watches. Use the healthcare terms correctly.",
    afterwards:
      "Write the follow-up here on this page: the recap, plus one of a bad-news email, an escalation message or a weekly status report.",
    next: "Phase 3 starts there, with your live client calls.",
    scenarioAside: "A healthcare scenario: discovery, a risk or bad news, and pushback",
    rubricAside: "25-min healthcare scenario",
    surprisePlaceholder: "e.g. The client pushes back on the go-live date",
    defaultCard: null,
  },
};

/** "Recap + bad-news email" (Gate 2's written follow-up), or "Recap" without a second piece. */
export function followUpText(type: FollowUpType | null | undefined): string {
  if (!type) return "Recap";
  const label = FOLLOW_UP_LABELS[type];
  return `Recap + ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
}

/**
 * Gate 2's second written piece: a type and at least 20 characters (like the recap). Always fine for
 * Gate 1, which has none.
 */
export function followUpOk(gate: GateNo, type: FollowUpType | null | undefined, text: string): boolean {
  if (gate === 1) return true;
  return type !== null && type !== undefined && text.trim().length >= 20;
}

/**
 * Gate 2 needs the Phase 3 live-call plan when it's passed (Phase 3 starts); a repeat doesn't. Gate 1 has none.
 */
export function liveCallPlanOk(gate: GateNo, plan: string, outcome: GateOutcome): boolean {
  return gate === 1 || outcome === "repeat" || plan.trim().length > 0;
}

/** The example in the live-call plan field (mockup `gate()`). */
export const LIVE_CALL_PLAN_EXAMPLE = "Shadow: Days 43, 45 · Co-lead: 48, 53, 55 · Lead: 58, 60";
