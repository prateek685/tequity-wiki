import { describe, expect, it } from "vitest";
import {
  type BehaviourPillar,
  emptyPillarScores,
  pillarAverages,
  pillarsOf,
  ratedPillarScores,
  rubricAverages,
  scorecardSeries,
  weekOf,
  weekStats,
} from "./scorecard.js";

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

describe("pillar averages", () => {
  it("averages the rated behaviours of each pillar to 1 decimal; unrated pillars are null", () => {
    expect(pillarAverages({ C1: 3, C4: 4, S2: 2 }, BEHAVIOURS)).toEqual({
      understand: null,
      communicate: 3.5,
      own: null,
      stand_firm: 2,
    });
    expect(pillarAverages({ U1: 1, U2: 2, U3: 2 }, BEHAVIOURS).understand).toBe(1.7);
    expect(ratedPillarScores(pillarAverages({ C1: 3, C4: 4 }, BEHAVIOURS))).toEqual({ communicate: 3.5 });
  });

  it("finds the pillars of a scorecard's behaviours, in pillar order", () => {
    expect(pillarsOf(["S1", "C4", "C1"], BEHAVIOURS)).toEqual(["communicate", "stand_firm"]);
  });

  it("puts days in weeks of 5", () => {
    expect([1, 5, 6, 10, 65].map(weekOf)).toEqual([1, 1, 2, 2, 13]);
  });
});

describe("scorecard series", () => {
  const dayOne = { understand: 2, communicate: 2.5, own: 3, stand_firm: 1.5 };

  it("carries forward unrated pillars from the latest earlier scorecard, else the Day-1 baseline", () => {
    const { scorecards, now } = scorecardSeries(
      [
        { week: 2, day: 10, pillarScores: { understand: 3.5 }, daysCompleted: 4, mocksDone: 2 },
        { week: 1, day: 5, pillarScores: { communicate: 3, stand_firm: 2 }, daysCompleted: 5, mocksDone: 3 },
      ],
      dayOne,
    );
    expect(scorecards).toEqual([
      {
        week: 1,
        day: 5,
        scores: { understand: 2, communicate: 3, own: 3, stand_firm: 2 },
        rated: ["communicate", "stand_firm"],
        daysCompleted: 5,
        mocksDone: 3,
      },
      {
        week: 2,
        day: 10,
        scores: { understand: 3.5, communicate: 3, own: 3, stand_firm: 2 },
        rated: ["understand"],
        daysCompleted: 4,
        mocksDone: 2,
      },
    ]);
    expect(now).toEqual({ understand: 3.5, communicate: 3, own: 3, stand_firm: 2 });
  });

  it("leaves pillars null without a baseline, and `now` is the baseline before any scorecard", () => {
    const { scorecards } = scorecardSeries(
      [{ week: 1, day: 5, pillarScores: { own: 4 }, daysCompleted: 5, mocksDone: 0 }],
      null,
    );
    expect(scorecards[0]?.scores).toEqual({ ...emptyPillarScores(), own: 4 });
    expect(scorecardSeries([], dayOne).now).toEqual(dayOne);
    expect(scorecardSeries([], null).now).toEqual(emptyPillarScores());
  });
});

describe("rubric averages", () => {
  it("averages non-null mock self-scores for 1–10; 11 comes from gates only", () => {
    const result = rubricAverages([
      { criterion: 1, score: 4, source: "mock_self" },
      { criterion: 1, score: 3, source: "mock_self" },
      { criterion: 1, score: null, source: "mock_self" },
      { criterion: 2, score: 2, source: "gate" },
      { criterion: 11, score: 5, source: "mock_self" },
    ]);
    expect(result).toHaveLength(11);
    expect(result[0]).toEqual({ criterion: 1, average: 3.5, count: 2 });
    expect(result[1]).toEqual({ criterion: 2, average: null, count: 0 });
    expect(result[10]).toEqual({ criterion: 11, average: null, count: 0 });
  });
});

describe("week stats", () => {
  const lesson = (id: string, kind: "read" | "mock" | "scorecard", scorecard: string[] = []) => ({
    id,
    kind,
    scorecard,
  });

  it("counts completed days, the scorecard day once its other lessons are done, and saved mocks", () => {
    const friday = [lesson("read", "read"), lesson("call", "mock"), lesson("card", "scorecard", ["C1"])];
    const stats = weekStats([
      { lessons: [lesson("call", "mock")], doneIds: new Set(["call"]), completed: true },
      { lessons: [lesson("call", "mock")], doneIds: new Set(), completed: false },
      { lessons: [], doneIds: new Set(), completed: false },
      { lessons: [lesson("read", "read")], doneIds: new Set(["read"]), completed: true },
      { lessons: friday, doneIds: new Set(["read", "call"]), completed: false },
    ]);
    expect(stats).toEqual({ daysCompleted: 3, mocksDone: 2 });
    const notYet = weekStats([{ lessons: friday, doneIds: new Set(["read"]), completed: false }]);
    expect(notYet).toEqual({ daysCompleted: 0, mocksDone: 0 });
  });
});
