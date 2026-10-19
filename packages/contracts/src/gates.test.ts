import { describe, expect, it } from "vitest";
import { type Pillar } from "./content.js";
import { type GateCriteria, gateMaths, gatePillarAverages, meetsBar, suggestRepeatWeeks } from "./gates.js";

// The approved rubric → pillar mapping (docs/PORTAL_PLAN.md §3).
const PILLAR_OF: Record<number, Pillar> = {
  1: "communicate",
  2: "communicate",
  3: "understand",
  4: "understand",
  5: "understand",
  6: "communicate",
  7: "stand_firm",
  8: "own",
  9: "stand_firm",
  10: "own",
  11: "own",
};

// Weeks 1–4 by their Friday scorecard behaviours: C1 C4 · C2 C4 O3 · U1 U2 · U4 O3 O4 S1.
const WEEKS = [
  { week: 1, pillars: ["communicate", "communicate"] },
  { week: 2, pillars: ["communicate", "communicate", "own"] },
  { week: 3, pillars: ["understand", "understand"] },
  { week: 4, pillars: ["understand", "own", "own", "stand_firm"] },
] as const satisfies readonly { week: number; pillars: readonly Pillar[] }[];

describe("gate maths", () => {
  it("averages scored criteria only and finds the lowest", () => {
    const criteria: GateCriteria = { "1": 3, "2": 2, "3": null, "11": 4 };
    expect(gateMaths(criteria)).toEqual({ scored: 3, average: 3, lowest: 2 });
    expect(gateMaths({ "1": null })).toEqual({ scored: 0, average: null, lowest: null });
    expect(gateMaths({ "1": 2, "2": 3, "3": 3 }).average).toBe(2.67);
  });

  it("applies the Gate 1 bar: average ≥ 2.5, nothing at 1, recap on time", () => {
    expect(meetsBar(1, { "1": 3, "2": 2 }, true)).toBe(true);
    expect(meetsBar(1, { "1": 3, "2": 2 }, false)).toBe(false);
    expect(meetsBar(1, { "1": 4, "2": 4, "3": 1 }, true)).toBe(false);
    expect(meetsBar(1, { "1": 2, "2": 2, "3": 3 }, true)).toBe(false); // 2.33
    expect(meetsBar(1, {}, true)).toBeNull();
  });
});

describe("repeat suggestion", () => {
  it("suggests the 2 weeks that teach the gate's weakest pillars", () => {
    // Understand and Stand firm weak, Communicate and Own strong.
    const averages = gatePillarAverages(
      { "1": 4, "2": 4, "3": 2, "4": 1, "7": 2, "8": 4, "10": 3 },
      PILLAR_OF,
    );
    expect(averages).toEqual({ communicate: 4, understand: 1.5, own: 3.5, stand_firm: 2 });
    expect(suggestRepeatWeeks(averages, WEEKS)).toEqual([3, 4]);
  });

  it("breaks ties on the earlier week and puts unscored weeks last", () => {
    expect(suggestRepeatWeeks({ communicate: 2 }, WEEKS)).toEqual([1, 2]);
    expect(suggestRepeatWeeks({ understand: 3, communicate: 3 }, WEEKS)).toEqual([1, 2]);
  });
});

describe("Gate 2 bar", () => {
  it("needs average ≥ 3.0, nothing below 2 and healthcare terms; recap time doesn't count", () => {
    expect(meetsBar(2, { "1": 3, "2": 3 }, false, true)).toBe(true);
    expect(meetsBar(2, { "1": 3, "2": 3 }, true, false)).toBe(false);
    expect(meetsBar(2, { "1": 4, "2": 3, "3": 2 }, true, true)).toBe(true);
    expect(meetsBar(2, { "1": 4, "2": 4, "3": 1 }, true, true)).toBe(false);
    expect(meetsBar(2, { "1": 3, "2": 2 }, true, true)).toBe(false); // 2.5
  });
});
