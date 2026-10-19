import { type Question } from "@portal/contracts";
import { describe, expect, it } from "vitest";
import { checkContent, normalizeText } from "./check.js";
import { type ContentBundle, type DayFile, dayFile, planFile } from "./files.js";

const PDF = "Say the answer first, then the reason. If they want more detail, they will ask.";

function mcq(id: string, overrides: Partial<Question> = {}): Question {
  return {
    id,
    type: "mcq",
    stem: `Question ${id}?`,
    options: [
      { text: "A", correct: true, explanation: "Right." },
      { text: "B", correct: false, explanation: "No." },
      { text: "C", correct: false, explanation: "No." },
      { text: "D", correct: false, explanation: "No." },
    ],
    source: { quote: "Say the answer first, then the reason.", page: 24 },
    ...overrides,
  };
}

function dailyPool(): Question[] {
  const questions: Question[] = [];
  for (let i = 1; i <= 7; i++) questions.push(mcq(`D01-${String(i).padStart(2, "0")}`));
  questions.push(mcq("D01-08", { type: "scenario", clientLine: "Can we ship Friday?" }));
  for (const id of ["D01-09", "D01-10"]) {
    questions.push({
      ...mcq(id),
      type: "written",
      options: undefined,
      modelAnswer: "Yes, Friday works.",
      scoringPoints: ["Answer first", "One reason"],
    });
  }
  return questions;
}

const LESSON = {
  blocks: [],
  fields: [],
  checks: [],
  rubric: false,
  brief: true,
  baseline: false,
  scorecard: [],
  source: "carebook" as const,
  shareReadiness: false,
};

const day1: DayFile = {
  day: 1,
  block: 1,
  title: "Baseline call",
  type: "normal",
  storyDate: "Monday, March 2",
  minutes: "About 60 min",
  intro: "Find your starting point.",
  lessons: [
    {
      ...LESSON,
      id: "meet-carebook",
      kind: "read",
      title: "Meet CareBook",
      minutes: "8 min",
      blocks: [{ type: "scene", when: "Monday, March 2 · 9:00", text: "Your first day." }],
    },
    { ...LESSON, id: "the-call", kind: "mock", title: "Baseline call", minutes: "15 min", cardId: "S01", level: 1 },
    {
      ...LESSON,
      id: "after-the-call",
      kind: "reflect",
      title: "After the call",
      minutes: "5 min",
      fields: [{ id: "went-well", label: "What went well", kind: "area", placeholder: "", required: false }],
      checksTitle: "On this call, I…",
      checks: ["Answered first."],
      rubric: true,
    },
    { ...LESSON, id: "baseline", kind: "rate", title: "Your baseline", minutes: "10 min", baseline: true },
  ],
};

const lessonOf = (id: string) => {
  const found = day1.lessons.find((item) => item.id === id);
  if (!found) throw new Error("fixture");
  return found;
};

function bundle(overrides: Partial<ContentBundle> = {}): ContentBundle {
  return {
    plan: null,
    blocks: [{ number: 1, title: "Baseline", phase: 1, goal: "Goal." }],
    days: [day1],
    cards: [],
    library: [],
    pools: [{ pool: "day-01", questions: dailyPool() }],
    ...overrides,
  };
}

const withoutPlanProblem = (problems: string[]) => problems.filter((p) => !p.startsWith("content/plan.yaml"));

describe("checkContent", () => {
  it("accepts a consistent day, except the missing card", () => {
    expect(withoutPlanProblem(checkContent(bundle(), PDF))).toEqual([
      "days/day-01 the-call: card S01 has no file",
    ]);
  });

  it("finds a lesson id used twice and a card on a non-mock lesson", () => {
    const read = lessonOf("meet-carebook");
    const problems = checkContent(
      bundle({ days: [{ ...day1, lessons: [read, { ...read, cardId: "S01" }] }] }),
      PDF,
    );
    expect(problems).toContain('days/day-01: lesson id "meet-carebook" is used twice');
    expect(problems).toContain("days/day-01 meet-carebook: only mock lessons have a card, level and scriptNote");
  });

  it("finds ratings on the wrong lesson kind and checks without a title", () => {
    const lessons = [
      { ...lessonOf("meet-carebook"), baseline: true },
      { ...lessonOf("after-the-call"), checksTitle: undefined },
      { ...LESSON, id: "friday", kind: "scorecard" as const, title: "Scorecard", minutes: "5 min" },
    ];
    const problems = checkContent(bundle({ days: [{ ...day1, lessons }] }), PDF);
    expect(problems).toContain("days/day-01 meet-carebook: only a rate lesson has the baseline");
    expect(problems).toContain("days/day-01 after-the-call: checks need a checksTitle");
    expect(problems).toContain("days/day-01 friday: a scorecard lesson needs behaviours to rate");
  });

  it("checks recall blocks and scoring against earlier lessons", () => {
    const day2: DayFile = {
      ...day1,
      day: 2,
      lessons: [
        {
          ...LESSON,
          id: "look-back",
          kind: "read",
          title: "Look back",
          minutes: "3 min",
          blocks: [
            {
              type: "recall",
              label: "Your notes",
              day: 1,
              lesson: "after-the-call",
              fields: [
                { id: "went-well", label: "What went well" },
                { id: "missing", label: "Missing" },
              ],
            },
          ],
        },
      ],
      scoring: { "look-back": { modelAnswer: "A model.", scoringPoints: ["One", "Two"] } },
    };
    const problems = checkContent(bundle({ days: [day1, day2] }), PDF);
    expect(problems).toContain('days/day-02 look-back: recall field "missing" isn\'t in day 1 "after-the-call"');
    expect(problems).not.toContain('days/day-02 look-back: recall field "went-well" isn\'t in day 1 "after-the-call"');
    expect(problems).toContain('days/day-02: scoring "look-back" needs a write lesson');
  });

  it("allows a recall of an earlier lesson on the same day, not a later one", () => {
    const recallOf = (lesson: string) => ({
      type: "recall" as const,
      label: "Earlier",
      day: 1,
      lesson,
      fields: [{ id: "went-well", label: "What went well" }],
    });
    const lessons = day1.lessons.map((lesson) => ({ ...lesson }));
    const last = lessons.length - 1;
    const sourceIndex = lessons.findIndex((lesson) => lesson.id === "after-the-call");
    lessons[last] = { ...lessons[last]!, blocks: [recallOf("after-the-call")] };
    lessons[0] = { ...lessons[0]!, blocks: [recallOf("after-the-call")] };
    const problems = checkContent(bundle({ days: [{ ...day1, lessons }] }), PDF);
    expect(sourceIndex).toBeGreaterThan(0);
    expect(problems).toContain(`days/day-01 ${lessons[0].id}: recall must point to an earlier lesson`);
    expect(problems).not.toContain(`days/day-01 ${lessons[last].id}: recall must point to an earlier lesson`);
  });

  it("finds a missing block and a daily pool without a day", () => {
    const problems = checkContent(bundle({ blocks: [], pools: [{ pool: "day-02", questions: [] }] }), PDF);
    expect(problems).toContain("days/day-01: block 1 has no file");
    expect(problems).toContain("questions/day-02: Day 2 has no lesson file");
  });

  it("finds a question with two correct options", () => {
    const questions = dailyPool();
    questions[0] = mcq("D01-01", {
      options: [
        { text: "A", correct: true, explanation: "x" },
        { text: "B", correct: true, explanation: "x" },
        { text: "C", correct: false, explanation: "x" },
        { text: "D", correct: false, explanation: "x" },
      ],
    });
    expect(checkContent(bundle({ pools: [{ pool: "day-01", questions }] }), PDF)).toContain(
      "questions/day-01 D01-01: needs exactly 1 correct option",
    );
  });

  it("finds a quote that isn't in the PDF", () => {
    const questions = dailyPool();
    questions[0] = mcq("D01-01", { source: { quote: "Always start with the background story.", page: 24 } });
    expect(checkContent(bundle({ pools: [{ pool: "day-01", questions }] }), PDF)).toContain(
      "questions/day-01 D01-01: source quote not found in the PDF",
    );
  });

  it("finds duplicate questions and a wrong pool size", () => {
    const questions = dailyPool();
    questions[1] = mcq("D01-02", { stem: questions[0]?.stem ?? "" });
    questions.pop();
    const problems = checkContent(bundle({ pools: [{ pool: "day-01", questions }] }), PDF);
    expect(problems).toContain("questions/day-01 D01-02: same question as D01-01");
    expect(problems).toContain("questions/day-01: has 9 questions, needs 10");
  });
});

describe("file schemas", () => {
  it("reject unknown keys, such as a value split by an unquoted comma in YAML", () => {
    expect(dayFile.safeParse(day1).success).toBe(true);
    expect(dayFile.safeParse({ ...day1, pdfWeekday: "Mon" }).success).toBe(false);
    const scale = [1, 2, 3, 4, 5].map((score) => ({ score, meaning: "Fine." }));
    const result = planFile.safeParse({
      scale: [{ score: 1, meaning: "I avoid it", "or I freeze": null }, ...scale.slice(1)],
    });
    expect(result.error?.issues.some((issue) => issue.code === "unrecognized_keys")).toBe(true);
  });
});

describe("normalizeText", () => {
  it("ignores ligatures, curly quotes, dashes and line breaks from the PDF", () => {
    expect(normalizeText("Trade-oﬀs —\n“short”")).toBe(normalizeText('trade-offs - "short"'));
  });
});
