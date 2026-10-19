import {
  type GateResult,
  gatePillarAverages,
  type GateViewResponse,
  meetsBar,
  suggestRepeatWeeks,
} from "@portal/contracts";
import { describe, expect, it } from "vitest";
import {
  againstBar,
  averageText,
  barPill,
  criterionText,
  asGateNo,
  engineerStatusLabel,
  followUpOk,
  followUpText,
  GATE_COPY,
  gateAfter,
  gateWeeksText,
  heldAtIso,
  heldAtParts,
  liveCallPlanOk,
  needsManager,
  outlineGateHint,
  passLine,
  planGateDetail,
  recapOk,
  recapOnTime,
  repeatWeeksSentence,
  repeatWeeksText,
  roundBadge,
  roundLabel,
  shownResult,
  suggestedOutcome,
} from "./gates";
import { criterionPillars, GATE_RUBRIC } from "./rubric";

const priya = { id: "00000000-0000-4000-8000-000000000001", name: "Priya Rao" };

const result = (round: number, outcome: GateResult["outcome"] = "pass"): GateResult => ({
  round,
  heldAt: "2026-10-10T10:00:00.000Z",
  scored: 2,
  average: 3,
  lowest: 3,
  criteria: { "1": 3, "2": 3 },
  recapOnTime: true,
  outcome,
  focusItems: [],
  repeatWeeks: outcome === "repeat" ? [2, 3] : [],
  rag: "green",
  note: "Solid.",
  by: priya,
  healthcareTerms: null,
  liveCallPlan: null,
});

describe("gate display rules", () => {
  it("labels rounds only from round 2", () => {
    expect(roundBadge(1)).toBeNull();
    expect(roundBadge(2)).toBe("Round 2");
    expect(roundLabel(1)).toBeNull();
    expect(roundLabel(2)).toBe("Round 2 · repeat");
  });

  it("writes status copy for the engineer and the manager", () => {
    expect(engineerStatusLabel("recap_sent")).toBe("Recap sent");
    expect(engineerStatusLabel("to_book")).toBe("To book");
    expect(planGateDetail("to_book", 20)).toBe("Book it with your manager · 45 min live call");
    expect(planGateDetail("locked", 20)).toContain("Opens once Day 20 is done");
    expect(planGateDetail("passed", 20)).toBe("Passed · Day 21 is open");
    expect(outlineGateHint("locked")).toBe("");
    expect(outlineGateHint("rerun")).toBe("Book again");
    expect(["to_book", "recap_sent", "rerun"].every((s) => needsManager(s as "to_book"))).toBe(true);
    expect(needsManager("passed")).toBe(false);
    expect(needsManager("locked")).toBe(false);
  });

  it("writes repeat weeks as day ranges", () => {
    expect(repeatWeeksText([3, 2])).toBe("Days 6–10, 11–15");
    expect(repeatWeeksText([])).toBe("");
    expect(repeatWeeksSentence([2, 3])).toBe("Days 6–10 and 11–15");
    expect(repeatWeeksSentence([4])).toBe("Days 16–20");
  });

  it("checks the recap arrived within 2 hours of the call", () => {
    const held = "2026-10-10T10:00:00.000Z";
    expect(recapOnTime("2026-10-10T12:00:00.000Z", held)).toBe(true);
    expect(recapOnTime("2026-10-10T12:00:01.000Z", held)).toBe(false);
    // Sent before the recorded time (the manager rounded the time): still on time.
    expect(recapOnTime("2026-10-10T09:50:00.000Z", held)).toBe(true);
    expect(recapOnTime(null, held)).toBe(false);
    expect(recapOnTime("2026-10-10T10:30:00.000Z", null)).toBe(false);
  });

  it("defaults Held at to now and turns it back into an ISO time", () => {
    const at = new Date(2026, 9, 10, 9, 5);
    expect(heldAtParts(at)).toEqual({ date: "2026-10-10", time: "09:05" });
    expect(heldAtIso("2026-10-10", "09:05")).toBe(at.toISOString());
    expect(heldAtIso("", "09:05")).toBeNull();
    expect(heldAtIso("2026-10-10", "")).toBeNull();
  });

  it("shows the live pass-bar pill and suggests the outcome", () => {
    expect(barPill(null).label).toBe("Score at least one criterion");
    expect(barPill(true).label).toBe("Meets the pass bar");
    expect(barPill(false).label).toBe("Below the pass bar");
    expect(suggestedOutcome(false)).toBe("repeat");
    expect(suggestedOutcome(true)).toBe("pass");
    expect(suggestedOutcome(null)).toBe("pass");
  });

  it("flags outcomes that go against the bar", () => {
    expect(againstBar("pass", true)).toBe(false);
    expect(againstBar("pass_focus", true)).toBe(false);
    expect(againstBar("repeat", true)).toBe(true);
    expect(againstBar("pass", false)).toBe(true);
    expect(againstBar("pass_focus", false)).toBe(true);
    expect(againstBar("repeat", false)).toBe(false);
    expect(againstBar("repeat", null)).toBe(false);
  });

  it("formats numbers and criteria", () => {
    expect(averageText(2.5)).toBe("2.50");
    expect(averageText(null)).toBe("—");
    expect(criterionText(null)).toBe("n/a");
    expect(criterionText(undefined)).toBe("n/a");
    expect(criterionText(4)).toBe("4");
    expect(recapOk("too short")).toBe(false);
    expect(recapOk("Bottom line: Friday works. Owners and dates below.")).toBe(true);
  });

  it("finds the gate after a day in the outline", () => {
    const gate = { gate: 1, afterDay: 20, status: "to_book" as const };
    const weeks = [
      { gate: null, finalReview: null, assessment: null, number: 3, title: "", phase: 1, days: [] },
      { gate, finalReview: null, assessment: null, number: 4, title: "", phase: 1, days: [] },
    ];
    expect(gateAfter({ weeks }, 20)).toEqual(gate);
    expect(gateAfter({ weeks }, 15)).toBeNull();
    expect(gateAfter(undefined, 20)).toBeNull();
  });

  it("shows the newest result while repeating", () => {
    const base: Pick<GateViewResponse, "status" | "result" | "history"> = {
      status: "repeat",
      result: null,
      history: [result(1, "repeat")],
    };
    expect(shownResult(base)).toEqual({ result: result(1, "repeat"), earlier: [] });
    expect(shownResult({ ...base, status: "rerun" })).toEqual({
      result: null,
      earlier: [result(1, "repeat")],
    });
    const current = { ...base, status: "passed" as const, result: result(2) };
    expect(shownResult(current)).toEqual({ result: result(2), earlier: [result(1, "repeat")] });
  });
});

describe("gate 2", () => {
  it("reads the gate number and the weeks it covers", () => {
    expect(asGateNo(2)).toBe(2);
    expect(asGateNo(1)).toBe(1);
    expect(asGateNo(7)).toBe(1);
    expect(gateWeeksText(1)).toBe("Weeks 1–4");
    expect(gateWeeksText(2)).toBe("Weeks 5–8");
  });

  it("writes the pass line from the PDF bar", () => {
    expect(passLine(1)).toBe("Pass: average ≥ 2.5, no criterion at 1, recap within 2 hours.");
    expect(passLine(2)).toBe(
      "Pass: average ≥ 3.0, no criterion below 2, basic healthcare terms used correctly.",
    );
  });

  it("has portal-native copy for both gates", () => {
    expect(GATE_COPY[2].rubricAside).toBe("25-min healthcare scenario");
    expect(GATE_COPY[2].call).toContain("25 minutes");
    expect(GATE_COPY[2].scenario).toContain("discovery");
    expect(GATE_COPY[2].afterwards).toContain("bad-news email");
    expect(GATE_COPY[1].defaultCard).toBe("S12");
    for (const copy of Object.values(GATE_COPY)) expect(JSON.stringify(copy)).not.toMatch(/section \d/i);
  });

  it("names the written follow-up", () => {
    expect(followUpText("bad_news_email")).toBe("Recap + bad-news email");
    expect(followUpText("escalation")).toBe("Recap + escalation message");
    expect(followUpText("weekly_status")).toBe("Recap + weekly status report");
    expect(followUpText(null)).toBe("Recap");
  });

  it("requires the second piece and the live-call plan for Gate 2 only", () => {
    const piece = "Subject: UAT moves to Friday. Bottom line first…";
    expect(followUpOk(1, null, "")).toBe(true);
    expect(followUpOk(2, null, piece)).toBe(false);
    expect(followUpOk(2, "escalation", "too short")).toBe(false);
    expect(followUpOk(2, "escalation", piece)).toBe(true);
    expect(liveCallPlanOk(1, "", "pass")).toBe(true);
    expect(liveCallPlanOk(2, "  ", "pass")).toBe(false);
    expect(liveCallPlanOk(2, "  ", "pass_focus")).toBe(false);
    expect(liveCallPlanOk(2, "", "repeat")).toBe(true);
    expect(liveCallPlanOk(2, "Shadow: Days 43, 45", "pass")).toBe(true);
  });

  it("uses healthcare terms, not the recap time, for the Gate 2 bar", () => {
    const criteria = { "1": 3, "2": 3, "3": 4 };
    expect(meetsBar(2, criteria, false, true)).toBe(true);
    expect(meetsBar(2, criteria, true, false)).toBe(false);
    // Average 3.25 but one criterion below 2.
    expect(meetsBar(2, { "1": 4, "2": 4, "3": 4, "4": 1 }, true, true)).toBe(false);
    expect(meetsBar(1, { "1": 2, "2": 3 }, true)).toBe(true);
  });
});

describe("gate rubric", () => {
  it("has the 11 criteria with the approved pillar mapping (PORTAL_PLAN §3)", () => {
    expect(GATE_RUBRIC.map((criterion) => criterion.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(criterionPillars()).toEqual({
      1: "communicate",
      2: "communicate",
      6: "communicate",
      3: "understand",
      4: "understand",
      5: "understand",
      8: "own",
      10: "own",
      11: "own",
      7: "stand_firm",
      9: "stand_firm",
    });
  });

  it("drives the contract rules for the live form", () => {
    const criteria = { "1": 4, "3": 2, "4": 2, "7": 3, "9": null };
    expect(meetsBar(1, criteria, true)).toBe(true);
    expect(meetsBar(1, criteria, false)).toBe(false);
    expect(meetsBar(1, { ...criteria, "2": 1 }, true)).toBe(false);
    const weeks = [
      { week: 1, pillars: ["communicate" as const, "communicate" as const] },
      { week: 2, pillars: ["understand" as const] },
      { week: 3, pillars: ["understand" as const, "own" as const] },
      { week: 4, pillars: ["stand_firm" as const] },
    ];
    expect(suggestRepeatWeeks(gatePillarAverages(criteria, criterionPillars()), weeks)).toEqual([2, 3]);
  });
});
