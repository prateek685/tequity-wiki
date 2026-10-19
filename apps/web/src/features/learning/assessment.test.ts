import { type CourseOutlineResponse } from "@portal/contracts";
import { describe, expect, it } from "vitest";
import {
  assessmentAfter,
  assessmentOpen,
  assessmentScreen,
  assessmentWeek,
  choiceNeeded,
  currentAssessmentDay,
  outlineHint,
  retakeLabel,
  rulesRows,
  waitLabel,
} from "./assessment";

const rules = { questions: 10, choiceQuestions: 8, writtenQuestions: 2, passPercent: 60, retakeHours: 24 };

const course = {
  currentDay: 5,
  unlockAll: false,
  phases: [],
  weeks: [
    {
      number: 1,
      title: "Week one",
      phase: 1,
      days: [],
      assessment: { day: 5, status: "ready" },
      gate: null,
      finalReview: null,
    },
    { number: 13, title: "Last week", phase: 3, days: [], assessment: null, gate: null, finalReview: null },
  ],
} satisfies CourseOutlineResponse;

describe("assessment helpers", () => {
  it("maps days to weeks and finds the assessment after a week's last day", () => {
    expect(assessmentWeek(5)).toBe(1);
    expect(assessmentWeek(60)).toBe(12);
    expect(assessmentAfter(course, 5)).toEqual({ day: 5, status: "ready" });
    expect(assessmentAfter(course, 4)).toBeNull();
    expect(assessmentAfter(course, 65)).toBeNull();
    expect(assessmentAfter(undefined, 5)).toBeNull();
  });

  it("picks the screen for the status", () => {
    const attempt = { id: "a", number: 1, items: [], completedAt: null, result: null };
    const result = { choiceCorrect: 4, choiceTotal: 8, percent: 50, passed: false, retakeAt: null };
    expect(assessmentScreen({ status: "locked", attempt: null })).toBe("locked");
    expect(assessmentScreen({ status: "not_ready", attempt: null })).toBe("not_ready");
    expect(assessmentScreen({ status: "ready", attempt: null })).toBe("intro");
    expect(assessmentScreen({ status: "in_progress", attempt })).toBe("questions");
    expect(assessmentScreen({ status: "failed", attempt: { ...attempt, result } })).toBe("result");
    expect(assessmentScreen({ status: "passed", attempt: null })).toBe("intro");
  });

  it("states the rules in plain words", () => {
    expect(choiceNeeded(rules)).toBe(5);
    expect(choiceNeeded({ choiceQuestions: 10, passPercent: 60 })).toBe(6);
    expect(waitLabel(24)).toBe("1 day");
    expect(waitLabel(48)).toBe("2 days");
    expect(waitLabel(12)).toBe("12 hours");
    const rows = rulesRows(rules);
    expect(rows.map((row) => row.label)).toEqual([
      "Questions",
      "To pass",
      "Written answers",
      "Not passed?",
      "Who sees it",
    ]);
    expect(rows[0]?.value).toBe("10: 8 multiple choice and 2 short written answers");
    expect(rows[1]?.value).toContain("**60% of the multiple-choice questions** (5 of 8)");
    expect(rows[3]?.value).toBe("Retake after 1 day, with new questions. Your lessons stay open to revise.");
    expect(rulesRows({ ...rules, writtenQuestions: 0, questions: 8 }).map((row) => row.label)).not.toContain(
      "Written answers",
    );
  });

  it("says when the retake opens, in local time", () => {
    const now = new Date(2026, 9, 8, 14, 0);
    expect(retakeLabel(null, now)).toBeNull();
    expect(retakeLabel(new Date(2026, 9, 8, 13, 0).toISOString(), now)).toBeNull();
    expect(retakeLabel(new Date(2026, 9, 8, 15, 15).toISOString(), now)).toBe(
      "Retake opens today at 3:15 pm",
    );
    expect(retakeLabel(new Date(2026, 9, 9, 9, 0).toISOString(), now)).toBe(
      "Retake opens tomorrow at 9:00 am",
    );
    expect(retakeLabel(new Date(2026, 9, 12, 9, 0).toISOString(), now)).toBe(
      "Retake opens on Mon 12 Oct at 9:00 am",
    );
  });

  it("labels the outline row and decides when it opens", () => {
    expect(outlineHint("ready")).toBe("10 q");
    expect(outlineHint("in_progress")).toBe("In progress");
    expect(outlineHint("passed")).toBe("Passed ✓");
    expect(assessmentOpen({ status: "locked" }, false)).toBe(false);
    expect(assessmentOpen({ status: "locked" }, true)).toBe(true);
    expect(assessmentOpen({ status: "not_ready" }, true)).toBe(false);
    expect(assessmentOpen({ status: "failed" }, false)).toBe(true);
  });

  it("picks the assessment for the menu", () => {
    const weeks = (...statuses: string[]) => ({
      weeks: statuses.map((status, index) => ({
        number: index + 1,
        title: "",
        phase: 1,
        days: [],
        assessment: { day: (index + 1) * 5, status: status as "ready" },
        gate: null,
        finalReview: null,
      })),
    });
    expect(currentAssessmentDay(undefined)).toBeNull();
    expect(currentAssessmentDay(weeks("passed", "failed", "locked"))).toBe(10);
    expect(currentAssessmentDay(weeks("passed", "locked", "locked"))).toBe(10);
    expect(currentAssessmentDay(weeks("passed", "passed", "not_ready"))).toBe(10);
  });
});
