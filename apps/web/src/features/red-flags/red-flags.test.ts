import { RED_FLAG_KINDS, RED_FLAG_TEXT } from "@portal/contracts";
import { describe, expect, it } from "vitest";
import { acknowledgedLine, emptyText, flagLine, RED_FLAGS_INTRO, redFlagsSub } from "./red-flags";

const priya = { id: "00000000-0000-4000-8000-000000000001", name: "Priya Rao" };

describe("red flags", () => {
  it("shows the PDF signal under the engineer's name", () => {
    expect(flagLine("scorecard_missing")).toBe("Scorecard missing 2 weeks in a row");
    expect(flagLine("gate_not_passed")).toBe("A gate not passed");
    for (const kind of RED_FLAG_KINDS) expect(flagLine(kind)).toBe(RED_FLAG_TEXT[kind].signal);
  });

  it("says the check runs hourly and excludes pause days", () => {
    expect(RED_FLAGS_INTRO).toBe("Checked every hour. Pause days are excluded.");
    expect(emptyText("open")).toBe("No red flags. Checked every hour; pause days are excluded.");
    expect(emptyText("acknowledged")).toBe("No acknowledged red flags yet.");
  });

  it("writes who acknowledged a flag and when", () => {
    expect(acknowledgedLine({ acknowledgedAt: null, acknowledgedBy: null })).toBeNull();
    const line = acknowledgedLine({ acknowledgedAt: "2026-11-21T10:00:00.000Z", acknowledgedBy: priya });
    expect(line).toMatch(/^Acknowledged by Priya Rao · 21 Nov$/);
    expect(acknowledgedLine({ acknowledgedAt: "2026-11-21T10:00:00.000Z", acknowledgedBy: null })).toBe(
      "Acknowledged · 21 Nov",
    );
  });

  it("labels the Team KPI", () => {
    expect(redFlagsSub(0)).toBe("None open");
    expect(redFlagsSub(2)).toBe("open");
  });
});
