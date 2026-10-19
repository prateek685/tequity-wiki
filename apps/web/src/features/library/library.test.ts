import { describe, expect, it } from "vitest";
import { isLibrarySection, sectionRows } from "./library";

const card = (id: string, title: string) => ({
  id,
  title,
  client: "Dana Brooks",
  clientRole: "VP of Product",
  clientInitials: "DB",
  clientPronoun: "She" as const,
  clientMood: "Busy.",
  level: 1,
  minutes: "10 min",
  storySoFar: "Story.",
  facts: [{ label: "Risk", value: "Epic access", warn: true }],
  yourGoal: "Answer first.",
  mayAsk: [],
  script: [],
  whatGood: [],
  day: 2,
});

describe("library sections", () => {
  it("lists every section with its first titles and a count", () => {
    const rows = sectionRows({
      entries: [
        { id: "bluf", kind: "framework", title: "BLUF", summary: "Answer first.", blocks: [] },
        { id: "a1", kind: "template", ref: "A1", title: "Pre-call card", summary: "Plan.", blocks: [] },
      ],
      cards: [card("S01", "Baseline call"), card("S02", "Rapid-fire status questions")],
    });
    expect(rows.map((row) => [row.section, row.count])).toEqual([
      ["framework", 1],
      ["template", 1],
      ["prompt", 0],
      ["glossary", 0],
      ["resource", 0],
      ["cards", 2],
    ]);
    expect(rows.at(-1)?.inside).toBe("S01 Baseline call, S02 Rapid-fire status questions");
  });

  it("knows its sections", () => {
    expect(isLibrarySection("glossary")).toBe(true);
    expect(isLibrarySection("secrets")).toBe(false);
  });
});
