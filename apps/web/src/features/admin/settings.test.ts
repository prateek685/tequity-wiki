import { describe, expect, it } from "vitest";
import { draftFrom, intError, settingsDiff } from "./settings";

const saved = {
  "assessment.passPercent": 60,
  "assessment.retakeHours": 24,
  "pace.behindToleranceDays": 3,
  "learning.unlockAll": true,
  "ai.scoreRealProjectAnswers": false,
  "some.otherKey": 5,
};

describe("admin settings", () => {
  it("builds the form from the saved values (editable keys only)", () => {
    const draft = draftFrom(saved);
    expect(draft["assessment.passPercent"]).toBe("60");
    expect(draft["learning.unlockAll"]).toBe(true);
    expect(Object.keys(draft)).not.toContain("some.otherKey");
  });

  it("checks whole numbers against the range", () => {
    expect(intError("assessment.passPercent", "60")).toBeNull();
    expect(intError("assessment.passPercent", "0")).toBe("Between 1 and 100.");
    expect(intError("assessment.passPercent", "")).toBe("Enter a whole number.");
    expect(intError("assessment.retakeHours", "1.5")).toBe("Enter a whole number.");
    expect(intError("learning.unlockAll", "x")).toBeNull();
  });

  it("sends only the changed keys", () => {
    expect(settingsDiff(saved, draftFrom(saved))).toEqual({});
    const draft = { ...draftFrom(saved), "assessment.passPercent": "70", "learning.unlockAll": false };
    expect(settingsDiff(saved, draft)).toEqual({ "assessment.passPercent": 70, "learning.unlockAll": false });
    expect(settingsDiff(saved, { ...draftFrom(saved), "assessment.retakeHours": "abc" })).toEqual({});
  });
});
