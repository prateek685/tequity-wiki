/**
 * The real services (Prisma + withUser) called as each role against the local database.
 * Complements privacy.test.ts, which checks the raw SQL policies.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DomainError } from "../../src/common/domain-error.js";
import { parseEnv } from "../../src/config/env.js";
import { PeopleService } from "../../src/people/people.service.js";
import { PrismaService } from "../../src/prisma/prisma.service.js";
import { UsersService } from "../../src/users/users.service.js";
import { Fixtures } from "../fixtures.js";

const fx = new Fixtures("d");
const prisma = new PrismaService(parseEnv(process.env));
const users = new UsersService(prisma);
const people = new PeopleService(prisma);

const noTeam = { teamId: null, startDate: null };

async function roleOf(key: string): Promise<string | null> {
  const { rows } = await fx.owner.query<{ role: string | null }>(
    "SELECT role::text AS role FROM users WHERE id = $1",
    [fx.id(key)],
  );
  return rows[0]?.role ?? null;
}

beforeAll(async () => {
  await fx.user("admin", "admin", "active");
  await fx.user("manager", "manager", "active");
  await fx.user("eng", "engineer", "active");
  await fx.user("otherEng", "engineer", "active");
  await fx.user("pending", null, "pending");
  await fx.team("team");
  await fx.team("otherTeam");
  await fx.owner.query("INSERT INTO team_members (user_id, team_id) VALUES ($1, $3), ($2, $4)", [
    fx.id("eng"),
    fx.id("otherEng"),
    fx.id("team"),
    fx.id("otherTeam"),
  ]);
  await fx.owner.query("INSERT INTO team_managers (team_id, user_id) VALUES ($1, $2)", [
    fx.id("team"),
    fx.id("manager"),
  ]);
  await fx.owner.query("INSERT INTO enrollments (user_id, start_date) VALUES ($1, '2026-11-04')", [
    fx.id("eng"),
  ]);
});

afterAll(async () => {
  await prisma.onModuleDestroy();
  await fx.cleanup();
});

describe("engineer data", () => {
  it("reads their own enrollment with the computed target date", async () => {
    expect(await people.myEnrollment(fx.id("eng"))).toEqual({
      startDate: "2026-11-04",
      targetDate: "2027-02-02",
      cycleNo: 1,
    });
  });
});

describe("manager data", () => {
  it("lists only engineers on the manager's teams", async () => {
    const { engineers, total } = await people.myEngineers(fx.id("manager"), 1);
    expect(total).toBe(1);
    expect(engineers.map((engineer) => engineer.id)).toEqual([fx.id("eng")]);
  });

  it("cannot use the admin functions", async () => {
    await expect(
      users.updateAccess(fx.id("manager"), fx.id("eng"), { role: "admin", status: "active", ...noTeam }),
    ).rejects.toThrow();
    expect(await roleOf("eng")).toBe("engineer");
  });

  it("through the admin list still sees only their own engineers (row-level security)", async () => {
    const { users: visible } = await users.list(fx.id("manager"), 1);
    expect(visible.map((user) => user.id).sort()).toEqual([fx.id("eng"), fx.id("manager")].sort());
  });
});

describe("admin data", () => {
  it("cannot change their own role or access", async () => {
    await expect(
      users.updateAccess(fx.id("admin"), fx.id("admin"), { role: "manager", status: "active", ...noTeam }),
    ).rejects.toEqual(new DomainError("SELF_ACCESS_CHANGE"));
  });

  it("must give a new engineer a team and a start date", async () => {
    await expect(
      users.updateAccess(fx.id("admin"), fx.id("pending"), { role: "engineer", status: "active", ...noTeam }),
    ).rejects.toEqual(new DomainError("APPROVAL_NEEDS_TEAM_AND_START"));
  });

  it("approves a new engineer: role, team, enrollment and separate audit entries", async () => {
    await users.updateAccess(fx.id("admin"), fx.id("pending"), {
      role: "engineer",
      status: "active",
      teamId: fx.id("team"),
      startDate: "2026-12-01",
    });
    const { rows } = await fx.owner.query<{ role: string; status: string; team_id: string; target: string }>(
      `SELECT u.role, u.status, m.team_id, e.target_date::text AS target
       FROM users u JOIN team_members m ON m.user_id = u.id JOIN enrollments e ON e.user_id = u.id
       WHERE u.id = $1`,
      [fx.id("pending")],
    );
    expect(rows[0]).toEqual({
      role: "engineer",
      status: "active",
      team_id: fx.id("team"),
      target: "2027-03-01",
    });
    const audit = await fx.owner.query<{ action: string }>(
      "SELECT action FROM audit_log WHERE actor_id = $1 AND entity_id = $2 ORDER BY id",
      [fx.id("admin"), fx.id("pending")],
    );
    expect(audit.rows.map((row) => row.action)).toEqual(
      expect.arrayContaining(["user.role_changed", "user.status_changed", "team.member_set"]),
    );
  });

  it("moving an engineer to manager removes their team membership", async () => {
    await users.updateAccess(fx.id("admin"), fx.id("otherEng"), {
      role: "manager",
      status: "active",
      ...noTeam,
    });
    const { rowCount } = await fx.owner.query("SELECT 1 FROM team_members WHERE user_id = $1", [
      fx.id("otherEng"),
    ]);
    expect(rowCount).toBe(0);
  });
});
