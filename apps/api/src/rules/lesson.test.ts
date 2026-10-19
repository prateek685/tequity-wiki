import { type LessonEntry } from "@portal/contracts";
import { describe, expect, it } from "vitest";
import {
  allLessonsDone,
  lessonEntryProblems,
  type LessonRules,
  PROOF_MESSAGE,
  LIVE_PATH_MESSAGE,
  RUBRIC_MESSAGE,
} from "./lesson.js";
import { type BehaviourPillar } from "./scorecard.js";

const PILLAR_OF = { U: "understand", C: "communicate", O: "own", S: "stand_firm" } as const;
const BEHAVIOURS: BehaviourPillar[] = [
  "U1",
  "U2",
  "U3",
  "U4",
  "C1",
  "C2",
  "C3",
  "C4",
  "O1",
  "O2",
  "O3",
  "O4",
  "S1",
  "S2",
].map((id) => ({ id, pillar: PILLAR_OF[id[0] as keyof typeof PILLAR_OF] }));

const plain: LessonRules = {
  kind: "read",
  fields: [],
  checks: [],
  rubric: false,
  baseline: false,
  scorecard: [],
};
const entry = (overrides: Partial<LessonEntry> = {}): LessonEntry => ({
  values: {},
  checked: [],
  ratings: {},
  rounds: [],
  rubric: {},
  realProject: false,
  livePath: null,
  ...overrides,
});
const field = (id: string, required = false) => ({
  id,
  label: id,
  kind: "line" as const,
  placeholder: "",
  required,
});

describe("lesson entry", () => {
  it("accepts an empty entry for a reading lesson", () => {
    expect(lessonEntryProblems(plain, entry(), BEHAVIOURS)).toEqual({});
  });

  it("needs required fields filled and rejects unknown fields", () => {
    const lesson = { ...plain, fields: [field("q1", true), field("q2")] };
    expect(lessonEntryProblems(lesson, entry({ values: { q1: "  " } }), BEHAVIOURS)).toEqual({
      "values.q1": "Fill this in.",
    });
    expect(lessonEntryProblems(lesson, entry({ values: { q1: "Yes", q3: "x" } }), BEHAVIOURS)).toEqual({
      "values.q3": "This lesson doesn't have that field.",
    });
    expect(lessonEntryProblems(lesson, entry({ values: { q1: "Yes" } }), BEHAVIOURS)).toEqual({});
  });

  it("accepts ticks that exist, never requires them", () => {
    const lesson = { ...plain, checks: ["One", "Two"] };
    expect(lessonEntryProblems(lesson, entry({ checked: [1] }), BEHAVIOURS)).toEqual({});
    expect(lessonEntryProblems(lesson, entry({ checked: [2] }), BEHAVIOURS)).toHaveProperty("checked");
  });

  it("needs all 14 behaviours on the baseline", () => {
    const lesson = { ...plain, baseline: true };
    const all = Object.fromEntries(BEHAVIOURS.map((b) => [b.id, 3]));
    expect(lessonEntryProblems(lesson, entry({ ratings: all }), BEHAVIOURS)).toEqual({});
    expect(lessonEntryProblems(lesson, entry({ ratings: { U1: 3 } }), BEHAVIOURS)).toHaveProperty("ratings");
  });

  it("needs exactly the scorecard's behaviours", () => {
    const lesson = { ...plain, scorecard: ["C1", "C4"] };
    const values = { "proof-communicate": "Led the sync." };
    expect(lessonEntryProblems(lesson, entry({ ratings: { C1: 2, C4: 4 }, values }), BEHAVIOURS)).toEqual({});
    expect(lessonEntryProblems(lesson, entry({ ratings: { C1: 2 }, values }), BEHAVIOURS)).toHaveProperty(
      "ratings",
    );
    expect(
      lessonEntryProblems(lesson, entry({ ratings: { C1: 2, C4: 4, U1: 1 }, values }), BEHAVIOURS),
    ).toHaveProperty("ratings");
  });

  it("needs proof for each rated pillar on a scorecard; win and stuck are optional", () => {
    const lesson = { ...plain, scorecard: ["C1", "S2"] };
    const ratings = { C1: 3, S2: 2 };
    expect(
      lessonEntryProblems(lesson, entry({ ratings, values: { "proof-communicate": " " } }), BEHAVIOURS),
    ).toEqual({
      "values.proof-communicate": PROOF_MESSAGE,
      "values.proof-stand-firm": PROOF_MESSAGE,
    });
    const full = {
      "proof-communicate": "Answer first in standup.",
      "proof-stand-firm": "Pushed back on scope.",
      win: "Demo went well.",
      stuck: "Estimates.",
    };
    expect(lessonEntryProblems(lesson, entry({ ratings, values: full }), BEHAVIOURS)).toEqual({});
    // Proof for a pillar the scorecard doesn't rate, or proof on another lesson, is not a field.
    expect(
      lessonEntryProblems(lesson, entry({ ratings, values: { ...full, "proof-own": "x" } }), BEHAVIOURS),
    ).toEqual({ "values.proof-own": "This lesson doesn't have that field." });
    expect(lessonEntryProblems(plain, entry({ values: { win: "x" } }), BEHAVIOURS)).toHaveProperty(
      "values.win",
    );
  });

  it("rejects ratings on a lesson without them", () => {
    expect(lessonEntryProblems(plain, entry({ ratings: { U1: 3 } }), BEHAVIOURS)).toHaveProperty("ratings");
  });

  it("allows up to the lesson's rounds", () => {
    const round = { score: 3, fix: "Slow down." };
    const lesson = { ...plain, rounds: 2 };
    expect(lessonEntryProblems(lesson, entry({ rounds: [round, round] }), BEHAVIOURS)).toEqual({});
    expect(lessonEntryProblems(lesson, entry({ rounds: [round, round, round] }), BEHAVIOURS)).toHaveProperty(
      "rounds",
    );
    expect(lessonEntryProblems(plain, entry({ rounds: [round] }), BEHAVIOURS)).toHaveProperty("rounds");
  });

  it("allows a rubric only on rubric lessons", () => {
    const rubric = { "1": 4, "2": null };
    expect(lessonEntryProblems({ ...plain, rubric: true }, entry({ rubric }), BEHAVIOURS)).toEqual({});
    expect(lessonEntryProblems(plain, entry({ rubric }), BEHAVIOURS)).toHaveProperty("rubric");
  });

  it("needs at least one rubric criterion scored on a mock log (n/a allowed)", () => {
    const lesson = { ...plain, rubric: true };
    expect(lessonEntryProblems(lesson, entry(), BEHAVIOURS)).toEqual({ rubric: RUBRIC_MESSAGE });
    expect(lessonEntryProblems(lesson, entry({ rubric: { "1": null, "2": null } }), BEHAVIOURS)).toEqual({
      rubric: RUBRIC_MESSAGE,
    });
    expect(lessonEntryProblems(lesson, entry({ rubric: { "3": 2, "4": null } }), BEHAVIOURS)).toEqual({});
  });
});

describe("lessons of a day", () => {
  const ids = ["a", "b", "c"];

  it("is all done only when every lesson is saved", () => {
    expect(allLessonsDone(ids, new Set(["a", "b"]))).toBe(false);
    expect(allLessonsDone(ids, new Set(ids))).toBe(true);
  });
});

describe("live lessons", () => {
  it("need a path; other lessons can't have one", () => {
    const live: LessonRules = { ...plain, kind: "live" };
    expect(lessonEntryProblems(live, entry(), BEHAVIOURS)).toEqual({ livePath: LIVE_PATH_MESSAGE });
    expect(lessonEntryProblems(live, entry({ livePath: "later" }), BEHAVIOURS)).toEqual({});
    expect(lessonEntryProblems(plain, entry({ livePath: "had_call" }), BEHAVIOURS)).toHaveProperty(
      "livePath",
    );
  });
});
