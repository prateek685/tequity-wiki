import { type DayViewResponse, type Lesson, SCORECARD_FIELDS } from "@portal/contracts";
import { describe, expect, it } from "vitest";
import {
  dayItems,
  kicker,
  mapFieldErrors,
  missingParts,
  PROOF_MISSING,
  QUIZ_ID,
  ratedPillars,
  RUBRIC_MISSING,
  startEntry,
  startItem,
} from "./player-nav";

const lesson = (id: string, kind: Lesson["kind"] = "read"): Lesson => ({
  id,
  kind,
  title: id,
  minutes: "5 min",
  blocks: [],
  brief: true,
  fields: [],
  checks: [],
  rubric: false,
  baseline: false,
  scorecard: [],
  source: "carebook",
  shareReadiness: false,
});

function day(done: string[], quiz: DayViewResponse["quiz"]["status"] = "locked") {
  const lessons = [lesson("meet"), lesson("pillars"), lesson("call", "mock")];
  return {
    lessons,
    quiz: { status: quiz, attemptId: null },
    progress: lessons.map((entry, index) => ({
      id: entry.id,
      done: done.includes(entry.id),
      doneAt: null,
      locked: index > 0 && !done.includes(lessons[index - 1]?.id ?? ""),
      entry: null,
      aiScore: null,
      modelAnswer: null,
    })),
  };
}

describe("course player rules", () => {
  it("lists the lessons, then the quiz", () => {
    expect(dayItems(day([])).map((item) => item.id)).toEqual(["meet", "pillars", "call", QUIZ_ID]);
    expect(dayItems(day([], "none")).map((item) => item.id)).toEqual(["meet", "pillars", "call"]);
    expect(dayItems(day([]))[2]?.meta).toBe("Mock call · 5 min");
  });

  it("opens a day on the first lesson not done, then the quiz", () => {
    expect(startItem(day([]))).toBe("meet");
    expect(startItem(day(["meet"]))).toBe("pillars");
    expect(startItem(day(["meet", "pillars", "call"], "ready"))).toBe(QUIZ_ID);
    expect(startItem(day(["meet", "pillars", "call"], "done"))).toBe("meet");
  });

  it("writes the kicker", () => {
    const items = dayItems(day([]));
    expect(kicker(1, 0, 4, items[0]!, "8 min")).toBe("Day 1 · Lesson 1 of 4 · 8 min");
    expect(kicker(1, 2, 4, items[2]!, "15 min")).toBe("Day 1 · Lesson 3 of 4 · Mock call · 15 min");
    expect(kicker(1, 3, 4, items[3]!)).toBe("Day 1 · Lesson 4 of 4 · Quiz · 5 questions");
  });

  it("checks required parts and maps API errors", () => {
    const rate = { ...lesson("rate", "rate"), baseline: true };
    const entry = startEntry(null, 3);
    expect(entry.rounds).toHaveLength(3);
    const behaviours = [
      { id: "U1", pillar: "understand" },
      { id: "U2", pillar: "understand" },
      { id: "S1", pillar: "stand_firm" },
    ] as const;
    const twoU = behaviours.slice(0, 2);
    expect(missingParts(rate, entry, twoU)).toEqual({ ratings: "Rate every behaviour from 1 to 5." });
    expect(missingParts(rate, { ...entry, ratings: { U1: 2, U2: 3 } }, twoU)).toEqual({});
    // A scorecard needs its ratings and one line of proof per rated pillar.
    const card = { ...lesson("week", "scorecard"), scorecard: ["U2", "S1"] };
    expect(ratedPillars(card.scorecard, behaviours)).toEqual(["understand", "stand_firm"]);
    expect(missingParts(card, { ...entry, ratings: { U2: 3, S1: 2 } }, behaviours)).toEqual({
      [SCORECARD_FIELDS.proof("understand")]: PROOF_MISSING,
      [SCORECARD_FIELDS.proof("stand_firm")]: PROOF_MISSING,
    });
    const proofs = {
      [SCORECARD_FIELDS.proof("understand")]: "Asked why twice.",
      [SCORECARD_FIELDS.proof("stand_firm")]: "Said I'd check.",
    };
    expect(missingParts(card, { ...entry, ratings: { U2: 3, S1: 2 }, values: proofs }, behaviours)).toEqual(
      {},
    );
    // A reflect rubric needs at least one criterion scored (n/a doesn't count).
    const reflect = { ...lesson("log", "reflect"), rubric: true };
    expect(missingParts(reflect, { ...entry, rubric: { "1": null } }, behaviours)).toEqual({
      rubric: RUBRIC_MISSING,
    });
    expect(missingParts(reflect, { ...entry, rubric: { "1": null, "2": 3 } }, behaviours)).toEqual({});
    expect(mapFieldErrors({ "values.q1": "Fill this in.", ratings: "Rate all.", checked: "Bad" })).toEqual({
      q1: "Fill this in.",
      ratings: "Rate all.",
      checked: "Bad",
    });
  });
});
