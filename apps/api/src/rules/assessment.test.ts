import { type QuestionType } from "@portal/contracts";
import { describe, expect, it } from "vitest";
import {
  assessmentPercent,
  assessmentStatus,
  type AssessmentStatusInput,
  canRetake,
  canSupplyAssessment,
  pickAssessment,
  retakeOpensAt,
  scoreAssessment,
} from "./assessment.js";

const q = (id: string, type: QuestionType) => ({ id, type });
const many = (prefix: string, type: QuestionType, n: number) =>
  Array.from({ length: n }, (_, i) => q(`${prefix}${i + 1}`, type));
/** About the real pool: 12 mcq, 4 scenario, 4 written. */
const pool = [...many("m", "mcq", 12), ...many("s", "scenario", 4), ...many("w", "written", 4)];

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

const types = (picked: { type: QuestionType }[] | null) => picked?.map((p) => p.type);

describe("assessment pick", () => {
  it("picks 6 mcq, 2 scenario, 2 written in that order, without repeats", () => {
    const picked = pickAssessment(pool, new Set(), seeded(3));
    expect(types(picked)).toEqual([
      ...Array<QuestionType>(6).fill("mcq"),
      "scenario",
      "scenario",
      "written",
      "written",
    ]);
    expect(new Set(picked?.map((p) => p.id)).size).toBe(10);
  });

  it("falls back to any choice mix when there are too few scenarios", () => {
    const fewScenarios = [...many("m", "mcq", 9), q("s1", "scenario"), ...many("w", "written", 2)];
    const picked = pickAssessment(fewScenarios, new Set(), seeded(1));
    expect(types(picked)).toEqual([...Array<QuestionType>(7).fill("mcq"), "scenario", "written", "written"]);
    const noMcq = [...many("s", "scenario", 8), ...many("w", "written", 2)];
    expect(pickAssessment(noMcq)?.filter((p) => p.type === "scenario")).toHaveLength(8);
  });

  it("prefers questions not asked before, topping up with asked ones", () => {
    const first = pickAssessment(pool, new Set(), seeded(5)) ?? [];
    const asked = new Set(first.map((p) => p.id));
    const retake = pickAssessment(pool, asked, seeded(9)) ?? [];
    // 10 fresh choice questions remain (6 mcq + 2 scenario), so all 8 are new; 2 fresh written too.
    expect(retake.filter((p) => asked.has(p.id))).toEqual([]);
    expect(types(retake)).toEqual(types(first));

    // Everything asked: a full attempt of repeats with the same mix.
    const all = new Set(pool.map((p) => p.id));
    expect(types(pickAssessment(pool, all, seeded(2)))).toEqual(types(first));

    // Only m1–m3 and w1 are fresh: they're all picked, the rest are repeats.
    const almost = new Set([...all].filter((id) => !["m1", "m2", "m3", "w1"].includes(id)));
    const third = pickAssessment(pool, almost, seeded(2)) ?? [];
    expect(third).toHaveLength(10);
    expect(new Set(third.map((p) => p.id)).size).toBe(10);
    expect(
      third
        .filter((p) => !almost.has(p.id))
        .map((p) => p.id)
        .sort(),
    ).toEqual(["m1", "m2", "m3", "w1"]);
    expect(types(third)).toEqual(types(first));
  });

  it("is deterministic for the same random source", () => {
    expect(pickAssessment(pool, new Set(), seeded(4))).toEqual(pickAssessment(pool, new Set(), seeded(4)));
  });

  it("returns null when the pool can't supply 8 choice + 2 written", () => {
    const short = [...many("m", "mcq", 7), ...many("w", "written", 3)];
    expect(canSupplyAssessment(short)).toBe(false);
    expect(pickAssessment(short)).toBeNull();
    expect(pickAssessment([...many("m", "mcq", 10), q("w1", "written")])).toBeNull();
    expect(canSupplyAssessment(pool)).toBe(true);
  });
});

describe("assessment score", () => {
  it("rounds the percent down and passes at the pass mark", () => {
    expect(assessmentPercent(5, 8)).toBe(62);
    expect(assessmentPercent(2, 3)).toBe(66);
    expect(assessmentPercent(0, 0)).toBe(0);
    const at = new Date("2026-10-08T10:00:00Z");
    expect(
      scoreAssessment({
        choiceCorrect: 5,
        choiceTotal: 8,
        passPercent: 60,
        retakeHours: 24,
        completedAt: at,
      }),
    ).toEqual({ choiceCorrect: 5, choiceTotal: 8, percent: 62, passed: true, retakeAt: null });
    expect(
      scoreAssessment({ choiceCorrect: 3, choiceTotal: 5, passPercent: 60, retakeHours: 24, completedAt: at })
        .passed,
    ).toBe(true);
  });

  it("fails below the pass mark and opens the retake after the wait", () => {
    const at = new Date("2026-10-08T10:00:00Z");
    const failed = scoreAssessment({
      choiceCorrect: 4,
      choiceTotal: 8,
      passPercent: 60,
      retakeHours: 24,
      completedAt: at,
    });
    expect(failed).toMatchObject({ percent: 50, passed: false });
    expect(failed.retakeAt?.toISOString()).toBe("2026-10-09T10:00:00.000Z");
    expect(retakeOpensAt(at, 0).getTime()).toBe(at.getTime());
  });
});

describe("assessment status", () => {
  const base: AssessmentStatusInput = {
    weekDone: true,
    unlockAll: false,
    poolReady: true,
    attempts: [],
    latest: null,
  };
  const open = { completed: false, passed: null, retakeAt: null };
  const failed = { completed: true, passed: false, retakeAt: new Date("2026-10-09T10:00:00Z") };
  const passed = { completed: true, passed: true, retakeAt: null };

  it("is locked until the week is done, unless unlockAll", () => {
    expect(assessmentStatus({ ...base, weekDone: false })).toBe("locked");
    expect(assessmentStatus({ ...base, weekDone: false, unlockAll: true })).toBe("ready");
    expect(assessmentStatus(base)).toBe("ready");
    expect(assessmentStatus({ ...base, poolReady: false })).toBe("not_ready");
  });

  it("follows the attempts", () => {
    expect(assessmentStatus({ ...base, attempts: [open], latest: open })).toBe("in_progress");
    expect(assessmentStatus({ ...base, attempts: [failed], latest: failed })).toBe("failed");
    expect(assessmentStatus({ ...base, attempts: [failed, open], latest: open })).toBe("in_progress");
    expect(assessmentStatus({ ...base, attempts: [failed, passed], latest: passed })).toBe("passed");
  });

  it("allows a retake once the wait is over and the pool can supply it", () => {
    const before = new Date("2026-10-09T09:59:59Z");
    const after = new Date("2026-10-09T10:00:00Z");
    expect(canRetake("failed", failed, true, before)).toBe(false);
    expect(canRetake("failed", failed, true, after)).toBe(true);
    expect(canRetake("failed", failed, false, after)).toBe(false);
    expect(canRetake("passed", passed, true, after)).toBe(false);
  });
});
