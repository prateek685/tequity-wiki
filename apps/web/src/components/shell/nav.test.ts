import { describe, expect, it } from "vitest";
import { crumbFor, engineerNav, isBelow, managerNav, NAV_BY_ROLE } from "./nav";

describe("navigation", () => {
  it("names the page in the breadcrumb", () => {
    expect(crumbFor("/app")).toEqual(["Home"]);
    expect(crumbFor("/app/")).toEqual(["Home"]);
    expect(crumbFor("/app/overview")).toEqual(["Overview"]);
    expect(crumbFor("/app/progress")).toEqual(["Progress"]);
    expect(crumbFor("/app/journal")).toEqual(["Journal"]);
    expect(crumbFor("/somewhere")).toEqual([]);
    expect(crumbFor("/manager")).toEqual(["Team"]);
    expect(crumbFor("/manager/engineers/abc")).toEqual(["Team", "Engineer"]);
    expect(crumbFor("/manager/engineers/abc/checkins/10")).toEqual(["Team", "Engineer", "Check-in"]);
    expect(crumbFor("/manager/engineers/abc/gates/1")).toEqual(["Team", "Engineer", "Gate"]);
    expect(crumbFor("/manager/gates")).toEqual(["Gates"]);
    expect(crumbFor("/admin/settings")).toEqual(["Settings"]);
  });

  it("shows Today only when a day is open, and Assessment once one is known", () => {
    expect(engineerNav(null).map((item) => item.label)).toEqual([
      "Home",
      "My plan",
      "Progress",
      "Journal",
      "Library",
      "Overview",
    ]);
    const items = engineerNav(2, 5);
    expect(items.map((item) => item.label)).toEqual([
      "Home",
      "Today",
      "My plan",
      "Assessment",
      "Progress",
      "Journal",
      "Library",
      "Overview",
    ]);
    expect(items[1]?.count).toBe("Day 2");
    const assessment = items[3];
    expect(assessment?.to === "/app/assessment/$day" ? assessment.day : null).toBe(5);
  });

  it("keeps five items in the phone tab bar, as in the mockup", () => {
    const tabs = engineerNav(2, 5).filter((item) => item.tab !== false);
    expect(tabs.map((item) => item.short)).toEqual(["Home", "Today", "My plan", "Progress", "Journal"]);
  });

  it("gives managers Team, Gates and Red flags with their counts", () => {
    expect(managerNav(null).map((item) => [item.label, item.count])).toEqual([
      ["Team", undefined],
      ["Gates", undefined],
      ["Red flags", undefined],
    ]);
    expect(managerNav(null, 2)[2]?.count).toBe("2");
    expect(managerNav(null, 0)[2]?.count).toBeUndefined();
    expect(crumbFor("/manager/red-flags")).toEqual(["Red flags"]);
    expect(managerNav(3)[1]?.count).toBe("3");
    expect(managerNav(0)[1]?.count).toBeUndefined();
    expect(isBelow("/manager/engineers/x", "/manager/engineers")).toBe(true);
    expect(isBelow("/manager/engineersx", "/manager/engineers")).toBe(false);
    expect(NAV_BY_ROLE.admin.items.map((item) => item.label)).toContain("Settings");
  });
});
