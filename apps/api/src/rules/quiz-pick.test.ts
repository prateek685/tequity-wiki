import { type QuestionType } from "@portal/contracts";
import { describe, expect, it } from "vitest";
import { canSupplyDailyQuiz, pickDailyQuiz } from "./quiz-pick.js";

const q = (id: string, type: QuestionType) => ({ id, type });
const pool = [
  q("m1", "mcq"),
  q("m2", "mcq"),
  q("s1", "scenario"),
  q("m3", "mcq"),
  q("w1", "written"),
  q("m4", "mcq"),
  q("s2", "scenario"),
  q("w2", "written"),
];

/** A repeatable pseudo-random sequence. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

describe("daily quiz pick", () => {
  it("picks 3 mcq, 1 scenario, 1 written in that order, without repeats", () => {
    const picked = pickDailyQuiz(pool, seeded(7));
    expect(picked?.map((p) => p.type)).toEqual(["mcq", "mcq", "mcq", "scenario", "written"]);
    expect(new Set(picked?.map((p) => p.id)).size).toBe(5);
  });

  it("is deterministic for the same random source and varies with it", () => {
    expect(pickDailyQuiz(pool, seeded(1))).toEqual(pickDailyQuiz(pool, seeded(1)));
    const picks = new Set(
      range(20).map((seed) =>
        pickDailyQuiz(pool, seeded(seed))
          ?.map((p) => p.id)
          .join(),
      ),
    );
    expect(picks.size).toBeGreaterThan(1);
  });

  it("uses the whole pool when it has exactly the mix", () => {
    const exact = [q("a", "written"), q("b", "mcq"), q("c", "scenario"), q("d", "mcq"), q("e", "mcq")];
    expect(
      pickDailyQuiz(exact, () => 0)
        ?.map((p) => p.id)
        .sort(),
    ).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("returns null when the pool can't supply the mix", () => {
    const noWritten = pool.filter((p) => p.type !== "written");
    expect(canSupplyDailyQuiz(noWritten)).toBe(false);
    expect(pickDailyQuiz(noWritten)).toBeNull();
    expect(pickDailyQuiz(pool.filter((p) => p.id !== "m1" && p.id !== "m2"))).toBeNull();
    expect(pickDailyQuiz([])).toBeNull();
  });
});

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}
