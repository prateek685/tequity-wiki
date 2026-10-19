import { describe, expect, it } from "vitest";
import { todayIso } from "./dates.js";

describe("todayIso", () => {
  it("follows the team's calendar, not UTC", () => {
    const earlyMorningInIndia = new Date("2026-10-07T20:00:00Z"); // 01:30 on 8 Oct in India
    expect(todayIso(earlyMorningInIndia, "Asia/Kolkata")).toBe("2026-10-08");
    expect(todayIso(earlyMorningInIndia, "UTC")).toBe("2026-10-07");
  });

  it("falls back to the default calendar when the setting is invalid", () => {
    expect(todayIso(new Date("2026-10-07T20:00:00Z"), "Not/AZone")).toBe("2026-10-08");
  });
});
