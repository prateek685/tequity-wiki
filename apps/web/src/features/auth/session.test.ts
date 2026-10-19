import { type Me } from "@portal/contracts";
import { describe, expect, it } from "vitest";
import { guardTarget } from "./session";

const user = (role: Me["role"], status: Me["status"]): Me => ({
  id: "7b0e7c2a-3f1c-4c6a-9a51-1d2b3c4d5e6f",
  email: "a@company.com",
  name: "A",
  role,
  status,
});

describe("guardTarget", () => {
  it("sends signed-out visitors to sign-in, remembering where they wanted to go", () => {
    expect(guardTarget(null, "app", "/app")).toBe("/sign-in?next=%2Fapp");
  });

  it("lets each role into its own area only", () => {
    expect(guardTarget(user("engineer", "active"), "app", "/app")).toBeNull();
    expect(guardTarget(user("engineer", "active"), "admin", "/admin/users")).toBe("/forbidden");
    expect(guardTarget(user("manager", "active"), "manager", "/manager")).toBeNull();
    expect(guardTarget(user("manager", "active"), "app", "/app")).toBe("/forbidden");
    expect(guardTarget(user("admin", "active"), "admin", "/admin/teams")).toBeNull();
    expect(guardTarget(user("admin", "active"), "manager", "/manager")).toBe("/forbidden");
  });

  it("lets every active role into the wiki home", () => {
    for (const role of ["engineer", "manager", "admin"] as const) {
      expect(guardTarget(user(role, "active"), "home", "/home")).toBeNull();
    }
    expect(guardTarget(null, "home", "/home")).toBe("/sign-in?next=%2Fhome");
    expect(guardTarget(user(null, "pending"), "home", "/home")).toBe("/pending");
  });

  it("keeps pending users on the waiting page and disabled users out", () => {
    expect(guardTarget(user(null, "pending"), "app", "/app")).toBe("/pending");
    expect(guardTarget(user("engineer", "disabled"), "app", "/app")).toBe("/sign-in?error=AccessDenied");
  });
});
