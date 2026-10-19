import { describe, expect, it } from "vitest";
import { settingsProblems, settingValue } from "./settings.js";

describe("settings", () => {
  it("accepts values that fit each setting's type and range", () => {
    expect(
      settingsProblems({
        "assessment.passPercent": 70,
        "assessment.retakeHours": 0,
        "pace.behindToleranceDays": 30,
        "learning.unlockAll": false,
        "ai.scoreRealProjectAnswers": true,
      }),
    ).toEqual({});
  });

  it("rejects unknown keys, wrong types and values out of range", () => {
    expect(
      settingsProblems({
        "plan.targetDays": 80,
        "assessment.passPercent": 0,
        "assessment.retakeHours": 1.5,
        "pace.behindToleranceDays": true,
        "learning.unlockAll": 1,
      }),
    ).toEqual({
      "values.plan.targetDays": "This setting can't be changed here.",
      "values.assessment.passPercent": "Use a whole number from 1 to 100.",
      "values.assessment.retakeHours": "Use a whole number from 0 to 168.",
      "values.pace.behindToleranceDays": "Use a whole number from 0 to 30.",
      "values.learning.unlockAll": "Choose on or off.",
    });
  });

  it("falls back to the default for a stored value that doesn't fit", () => {
    expect(settingValue("assessment.passPercent", 75, 60)).toBe(75);
    expect(settingValue("assessment.passPercent", "75", 60)).toBe(60);
    expect(settingValue("learning.unlockAll", null, false)).toBe(false);
  });
});
