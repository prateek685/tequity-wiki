import { type DayFile } from "@portal/content";
import { describe, expect, it } from "vitest";
import {
  contentHash,
  dayRow,
  type ExistingQuestion,
  type IncomingQuestion,
  planQuestions,
  stableStringify,
} from "./content-import.js";

const incoming = (id: string, hash: string): IncomingQuestion => ({
  id,
  pool: "day-01",
  type: "mcq",
  data: {},
  contentHash: hash,
});
const existing = (id: string, hash: string, extra: Partial<ExistingQuestion> = {}): ExistingQuestion => ({
  id,
  contentHash: hash,
  version: 1,
  retired: false,
  used: false,
  ...extra,
});

describe("content hash", () => {
  it("ignores key order and undefined fields", () => {
    expect(stableStringify({ b: 1, a: [{ d: 2, c: undefined }] })).toBe('{"a":[{"d":2}],"b":1}');
    expect(contentHash({ a: 1, b: 2 })).toBe(contentHash({ b: 2, a: 1 }));
    expect(contentHash({ a: 1 })).not.toBe(contentHash({ a: 2 }));
  });
});

describe("question import plan", () => {
  it("adds new questions and keeps unchanged ones as they are", () => {
    const plan = planQuestions(
      [existing("D01-01", "h1")],
      [incoming("D01-01", "h1"), incoming("D01-02", "h2")],
    );
    expect(plan.insert.map((q) => q.id)).toEqual(["D01-02"]);
    expect(plan.unchanged).toBe(1);
    expect(plan.update).toEqual([]);
  });

  it("bumps the version of a changed question", () => {
    const plan = planQuestions([existing("D01-01", "old", { version: 3 })], [incoming("D01-01", "new")]);
    expect(plan.update).toEqual([expect.objectContaining({ id: "D01-01", version: 4 })]);
  });

  it("deletes removed questions never asked, and retires removed questions already asked", () => {
    const plan = planQuestions(
      [
        existing("D01-01", "h"),
        existing("D01-02", "h", { used: true }),
        existing("D01-03", "h", { used: true, retired: true }),
      ],
      [],
    );
    expect(plan.delete).toEqual(["D01-01"]);
    expect(plan.retire).toEqual(["D01-02"]);
  });

  it("brings back a retired question that is in the files again", () => {
    const plan = planQuestions(
      [existing("D01-01", "h", { used: true, retired: true })],
      [incoming("D01-01", "h")],
    );
    expect(plan.restore).toEqual(["D01-01"]);
  });
});

describe("day rows", () => {
  const file: DayFile = {
    day: 2,
    block: 1,
    title: "Answer first",
    type: "normal",
    storyDate: "Tuesday, March 3",
    minutes: "About 45 min",
    intro: "Lead with the answer.",
    lessons: [
      {
        id: "rewrite",
        kind: "write",
        shareReadiness: false,
        title: "Rewrite it",
        minutes: "10 min",
        blocks: [],
        fields: [],
        checks: [],
        rubric: false,
        brief: true,
        baseline: false,
        scorecard: [],
        source: "carebook",
      },
    ],
    scoring: { rewrite: { modelAnswer: "Yes, Friday.", scoringPoints: ["Answer first", "One reason"] } },
  };

  it("keeps the scoring guide out of what engineers see", () => {
    const row = dayRow(file);
    expect(row.data).toEqual({
      storyDate: file.storyDate,
      minutes: file.minutes,
      intro: file.intro,
      lessons: file.lessons,
    });
    expect(JSON.stringify(row.data)).not.toContain("Yes, Friday.");
    expect(row.writeScoring).toEqual(file.scoring);
    expect(dayRow({ ...file, scoring: undefined }).writeScoring).toBeNull();
  });
});
