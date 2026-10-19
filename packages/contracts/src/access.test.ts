import { describe, expect, it } from "vitest";
import { type AccessSubject, areaPathFor, homePathFor } from "./access.js";

describe("homePathFor", () => {
  it("sends every active role to the wiki home", () => {
    for (const role of ["engineer", "manager", "admin"] as const) {
      expect(homePathFor({ role, status: "active" })).toBe("/home");
    }
  });

  it("gives each role its own course area", () => {
    expect(areaPathFor("engineer")).toBe("/app");
    expect(areaPathFor("manager")).toBe("/manager");
    expect(areaPathFor("admin")).toBe("/admin");
  });

  it("sends pending users to the waiting page and disabled users to sign-in", () => {
    const pending: AccessSubject = { role: null, status: "pending" };
    expect(homePathFor(pending)).toBe("/pending");
    expect(homePathFor({ role: "engineer", status: "disabled" })).toBe("/sign-in?error=AccessDenied");
  });

  it("treats an active user without a role as pending", () => {
    expect(homePathFor({ role: null, status: "active" })).toBe("/pending");
  });
});
