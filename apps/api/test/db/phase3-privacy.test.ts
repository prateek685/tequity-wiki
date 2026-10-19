/**
 * Privacy of Phase 3 (migration 20261012090000_phase3): live_calls, readiness_cases and final_reviews.
 * Fixtures are written with the owner connection; every assertion runs as `app_user` with app.user_id set,
 * in a rolled-back transaction, exactly like the API.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Fixtures } from "../fixtures.js";

const fx = new Fixtures("p3p");
const app = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function as<T>(userId: string, work: (db: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await app.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    return await work(client);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

async function failure(userId: string, sql: string, params: unknown[] = []): Promise<string> {
  return as(userId, async (db) => {
    try {
      await db.query(sql, params);
      return "";
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });
}

const count = (userId: string, sql: string, params: unknown[] = []) =>
  as(userId, async (db) => (await db.query(sql, params)).rowCount ?? 0);

const INSERT_LIVE = `INSERT INTO live_calls (enrollment_id, user_id, day, role, path, deferred)
  VALUES ($1, $2, 43, 'shadow', 'later', true)`;
const INSERT_CASE = `INSERT INTO readiness_cases (enrollment_id, user_id, fields)
  VALUES ($1, $2, '[{"id":"overall","label":"Overall","value":"Ready."}]')`;
const INSERT_REVIEW = `INSERT INTO final_reviews (enrollment_id, user_id, held_at, observer, call, criteria, scored,
  average, lowest, outcome, rag, note, manager_id)
  VALUES ($1, $2, now(), 'manager', 'Day 62 solo call', '{"1": 4}', 1, 4, 4, 'client_ready', 'green', 'Good.', $3)`;

beforeAll(async () => {
  await fx.user("admin", "admin", "active");
  await fx.user("manager", "manager", "active");
  await fx.user("other", "manager", "active");
  await fx.user("eng", "engineer", "active");
  await fx.user("eng2", "engineer", "active");
  const team = await fx.team("team");
  const otherTeam = await fx.team("otherteam");
  await fx.owner.query("INSERT INTO team_members (user_id, team_id) VALUES ($1, $3), ($2, $4)", [
    fx.id("eng"),
    fx.id("eng2"),
    team,
    otherTeam,
  ]);
  await fx.owner.query("INSERT INTO team_managers (team_id, user_id) VALUES ($1, $2), ($3, $4)", [
    team,
    fx.id("manager"),
    otherTeam,
    fx.id("other"),
  ]);
  for (const key of ["eng", "eng2"]) {
    await fx.insertId(
      `enr_${key}`,
      "INSERT INTO enrollments (user_id, start_date) VALUES ($1, '2026-07-01') RETURNING id",
      [fx.id(key)],
    );
  }
  // eng2 (other team) has a live call, a shared case and a recorded review.
  await fx.owner.query(INSERT_LIVE, [fx.id("enr_eng2"), fx.id("eng2")]);
  await fx.owner.query(INSERT_CASE, [fx.id("enr_eng2"), fx.id("eng2")]);
  await fx.owner.query(INSERT_REVIEW, [fx.id("enr_eng2"), fx.id("eng2"), fx.id("other")]);
});

afterAll(async () => {
  await app.end();
  await fx.cleanup();
});

describe("live_calls", () => {
  it("the engineer writes their own; only they, their managers and admins read them", async () => {
    const eng = fx.id("eng");
    await as(eng, async (db) => {
      await db.query(INSERT_LIVE, [fx.id("enr_eng"), eng]);
      expect((await db.query("UPDATE live_calls SET path = 'had_call'")).rowCount).toBe(1);
      expect((await db.query("SELECT user_id FROM live_calls")).rows).toEqual([{ user_id: eng }]);
    });
    expect(await failure(eng, INSERT_LIVE, [fx.id("enr_eng2"), fx.id("eng2")])).toMatch(/row-level security/);
    expect(
      await count(fx.id("manager"), "SELECT 1 FROM live_calls WHERE user_id = $1", [fx.id("eng2")]),
    ).toBe(0);
    expect(await count(fx.id("other"), "SELECT 1 FROM live_calls WHERE user_id = $1", [fx.id("eng2")])).toBe(
      1,
    );
    expect(await count(fx.id("admin"), "SELECT 1 FROM live_calls WHERE user_id = $1", [fx.id("eng2")])).toBe(
      1,
    );
    expect(await count(fx.id("other"), "UPDATE live_calls SET path = 'had_call'")).toBe(0);
    expect(await failure(fx.id("eng2"), "UPDATE live_calls SET deferred = false, day = 45")).toMatch(
      /permission denied/,
    );
    expect(await failure(fx.id("eng2"), "DELETE FROM live_calls")).toMatch(/permission denied/);
  });
});

describe("readiness_cases", () => {
  it("the engineer shares their own; their managers and admins read it", async () => {
    const eng = fx.id("eng");
    await as(eng, async (db) => {
      await db.query(INSERT_CASE, [fx.id("enr_eng"), eng]);
      expect((await db.query("SELECT user_id FROM readiness_cases")).rows).toEqual([{ user_id: eng }]);
    });
    expect(await failure(eng, INSERT_CASE, [fx.id("enr_eng2"), fx.id("eng2")])).toMatch(/row-level security/);
    expect(
      await count(fx.id("manager"), "SELECT 1 FROM readiness_cases WHERE user_id = $1", [fx.id("eng2")]),
    ).toBe(0);
    expect(
      await count(fx.id("other"), "SELECT 1 FROM readiness_cases WHERE user_id = $1", [fx.id("eng2")]),
    ).toBe(1);
    expect(await count(fx.id("other"), "UPDATE readiness_cases SET fields = '[]'")).toBe(0);
  });

  it("can't be changed once the final review is recorded", async () => {
    expect(await count(fx.id("eng2"), "UPDATE readiness_cases SET updated_at = now()")).toBe(0);
  });
});

describe("final_reviews", () => {
  it("only a manager of the team records it, once the case is shared", async () => {
    // eng hasn't shared the case yet: refused.
    expect(
      await failure(fx.id("manager"), INSERT_REVIEW, [fx.id("enr_eng"), fx.id("eng"), fx.id("manager")]),
    ).toMatch(/row-level security/);
    await fx.owner.query(INSERT_CASE, [fx.id("enr_eng"), fx.id("eng")]);
    expect(
      await failure(fx.id("manager"), INSERT_REVIEW, [fx.id("enr_eng"), fx.id("eng"), fx.id("manager")]),
    ).toBe("");
    expect(
      await failure(fx.id("other"), INSERT_REVIEW, [fx.id("enr_eng2"), fx.id("eng2"), fx.id("manager")]),
    ).toMatch(/row-level security/);
    expect(
      await failure(fx.id("eng2"), INSERT_REVIEW, [fx.id("enr_eng2"), fx.id("eng2"), fx.id("eng2")]),
    ).toMatch(/row-level security/);
    expect(await count(fx.id("manager"), "UPDATE final_reviews SET note = 'Changed.'")).toBe(0);
    expect(await count(fx.id("other"), "UPDATE final_reviews SET note = 'Corrected.'")).toBe(1);
    expect(await failure(fx.id("other"), "DELETE FROM final_reviews")).toMatch(/permission denied/);
  });

  it("the engineer reads their own; other managers don't", async () => {
    expect(await count(fx.id("eng2"), "SELECT 1 FROM final_reviews")).toBe(1);
    expect(await count(fx.id("eng"), "SELECT 1 FROM final_reviews")).toBe(0);
    expect(await count(fx.id("manager"), "SELECT 1 FROM final_reviews")).toBe(0);
    expect(
      await count(fx.id("admin"), "SELECT 1 FROM final_reviews WHERE user_id = $1", [fx.id("eng2")]),
    ).toBe(1);
  });
});
