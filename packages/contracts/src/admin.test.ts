import { describe, expect, it } from "vitest";
import { createTeamRequest, teamManagerRequest, updateUserAccessRequest } from "./admin.js";

const teamId = "0f9e8d7c-6b5a-4c3d-8e2f-1a2b3c4d5e6f";

describe("updateUserAccessRequest", () => {
  it("accepts an engineer with a team and start date", () => {
    const result = updateUserAccessRequest.parse({
      role: "engineer",
      status: "active",
      teamId,
      startDate: "2026-11-04",
    });
    expect(result).toEqual({ role: "engineer", status: "active", teamId, startDate: "2026-11-04" });
  });

  it("turns empty team and date into null", () => {
    const result = updateUserAccessRequest.parse({
      role: "manager",
      status: "active",
      teamId: "",
      startDate: "",
    });
    expect(result.teamId).toBeNull();
    expect(result.startDate).toBeNull();
  });

  it("treats missing team and date fields as none", () => {
    const result = updateUserAccessRequest.parse({ role: "manager", status: "active" });
    expect(result.teamId).toBeNull();
    expect(result.startDate).toBeNull();
  });

  it("rejects a team or start date for non-engineers", () => {
    expect(
      updateUserAccessRequest.safeParse({ role: "manager", status: "active", teamId, startDate: "" }).success,
    ).toBe(false);
    expect(
      updateUserAccessRequest.safeParse({
        role: "admin",
        status: "active",
        teamId: "",
        startDate: "2026-11-04",
      }).success,
    ).toBe(false);
  });

  it("rejects pending as a target status, unknown roles and bad dates", () => {
    const base = { teamId: "", startDate: "" };
    expect(updateUserAccessRequest.safeParse({ ...base, role: "engineer", status: "pending" }).success).toBe(
      false,
    );
    expect(updateUserAccessRequest.safeParse({ ...base, role: "owner", status: "active" }).success).toBe(
      false,
    );
    expect(
      updateUserAccessRequest.safeParse({
        role: "engineer",
        status: "active",
        teamId: "",
        startDate: "04/11/2026",
      }).success,
    ).toBe(false);
  });
});

describe("createTeamRequest", () => {
  it("trims and length-checks the name", () => {
    expect(createTeamRequest.parse({ name: "  Platform  " }).name).toBe("Platform");
    expect(createTeamRequest.safeParse({ name: "x" }).success).toBe(false);
  });
});

describe("teamManagerRequest", () => {
  it("requires a user id", () => {
    expect(teamManagerRequest.safeParse({ userId: "" }).success).toBe(false);
    expect(teamManagerRequest.safeParse({ userId: teamId }).success).toBe(true);
  });
});
