/**
 * Privacy of gates (migration 20261010090000_gates_rounds): gate_results, gate_recaps and the gate
 * criteria in rubric_scores. Fixtures are written with the owner connection; every assertion runs as
 * `app_user` with app.user_id set, in a rolled-back transaction, exactly like the API.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Fixtures } from "../fixtures.js";

const fx = new Fixtures("gp");
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

const rows = (userId: string, sql: string, params: unknown[] = []) =>
  as(userId, async (db) => (await db.query<Record<string, unknown>>(sql, params)).rows);
const count = (userId: string, sql: string, params: unknown[] = []) =>
  as(userId, async (db) => (await db.query(sql, params)).rowCount ?? 0);

const RESULT_COLUMNS = `(enrollment_id, user_id, gate, round, held_at, scored, average, lowest, recap_on_time,
  outcome, focus_items, repeat_weeks, rag, note, manager_id)`;
const resultValues = (enrollment: string, user: string, manager: string, round = 1) =>
  [enrollment, user, round, manager] as const;
const INSERT_RESULT = `INSERT INTO gate_results ${RESULT_COLUMNS}
  VALUES ($1, $2, 1, $3, now(), 3, 3, 2, true, 'pass', '{}', '{}', 'green', 'Good.', $4)`;
const INSERT_RECAP = `INSERT INTO gate_recaps (enrollment_id, user_id, gate, round, text) VALUES ($1, $2, 1, $3, 'My recap of the call.')`;

beforeAll(async () => {
  await fx.user("admin", "admin", "active");
  await fx.user("manager", "manager", "active");
  await fx.user("other", "manager", "active");
  await fx.user("eng", "engineer", "active");
  await fx.user("eng2", "engineer", "active");
  await fx.user("early", "engineer", "active");
  const team = await fx.team("team");
  const otherTeam = await fx.team("otherteam");
  await fx.owner.query("INSERT INTO team_members (user_id, team_id) VALUES ($1, $4), ($2, $5), ($3, $4)", [
    fx.id("eng"),
    fx.id("eng2"),
    fx.id("early"),
    team,
    otherTeam,
  ]);
  await fx.owner.query("INSERT INTO team_managers (team_id, user_id) VALUES ($1, $2), ($3, $4)", [
    team,
    fx.id("manager"),
    otherTeam,
    fx.id("other"),
  ]);
  for (const key of ["eng", "eng2", "early"]) {
    await fx.insertId(
      `enr_${key}`,
      "INSERT INTO enrollments (user_id, start_date) VALUES ($1, '2026-09-01') RETURNING id",
      [fx.id(key)],
    );
  }
  // eng and eng2 finished Day 20; early hasn't.
  for (const key of ["eng", "eng2"]) {
    await fx.owner.query(
      "INSERT INTO day_progress (enrollment_id, user_id, day, completed_at) VALUES ($1, $2, 20, now())",
      [fx.id(`enr_${key}`), fx.id(key)],
    );
  }
  // eng2 has a recorded result and a recap (written by the owner).
  await fx.owner.query(INSERT_RECAP, [fx.id("enr_eng2"), fx.id("eng2"), 1]);
  await fx.owner.query(INSERT_RESULT, [...resultValues(fx.id("enr_eng2"), fx.id("eng2"), fx.id("other"))]);
});

afterAll(async () => {
  await app.end();
  await fx.cleanup();
});

describe("gate_recaps", () => {
  it("the engineer writes their own recap once Day 20 is done, and edits it", async () => {
    const eng = fx.id("eng");
    await as(eng, async (db) => {
      await db.query(INSERT_RECAP, [fx.id("enr_eng"), eng, 1]);
      const updated = await db.query("UPDATE gate_recaps SET text = 'Edited recap.' WHERE user_id = $1", [
        eng,
      ]);
      expect(updated.rowCount).toBe(1);
      expect((await db.query("SELECT text FROM gate_recaps")).rows).toEqual([{ text: "Edited recap." }]);
    });
  });

  it("can't be written before Day 20, for someone else, or once the round is recorded", async () => {
    expect(await failure(fx.id("early"), INSERT_RECAP, [fx.id("enr_early"), fx.id("early"), 1])).toMatch(
      /row-level security/,
    );
    expect(await failure(fx.id("eng"), INSERT_RECAP, [fx.id("enr_eng2"), fx.id("eng2"), 2])).toMatch(
      /row-level security/,
    );
    expect(await failure(fx.id("eng"), INSERT_RECAP, [fx.id("enr_eng2"), fx.id("eng"), 2])).toMatch(
      /row-level security/,
    );
    // eng2's round 1 is recorded: no edit, no new recap for that round.
    expect(await count(fx.id("eng2"), "UPDATE gate_recaps SET text = 'Changed after.'")).toBe(0);
    expect(await failure(fx.id("eng2"), INSERT_RECAP, [fx.id("enr_eng2"), fx.id("eng2"), 1])).not.toBe("");
    expect(
      await count(fx.id("eng"), "UPDATE gate_recaps SET text = 'Not mine.' WHERE user_id = $1", [
        fx.id("eng2"),
      ]),
    ).toBe(0);
  });

  it("can't move the first submit time or be deleted", async () => {
    expect(await failure(fx.id("eng2"), "UPDATE gate_recaps SET submitted_at = now()")).toMatch(
      /permission denied/,
    );
    expect(await failure(fx.id("eng2"), "DELETE FROM gate_recaps")).toMatch(/permission denied/);
  });

  it("is read by the engineer, their managers and admins; not by other teams or engineers", async () => {
    const sql = "SELECT user_id FROM gate_recaps WHERE user_id = $1";
    expect(await rows(fx.id("eng2"), sql, [fx.id("eng2")])).toHaveLength(1);
    expect(await rows(fx.id("other"), sql, [fx.id("eng2")])).toHaveLength(1);
    expect(await rows(fx.id("admin"), sql, [fx.id("eng2")])).toHaveLength(1);
    expect(await rows(fx.id("manager"), sql, [fx.id("eng2")])).toEqual([]);
    expect(await rows(fx.id("eng"), sql, [fx.id("eng2")])).toEqual([]);
  });
});

describe("gate_results", () => {
  it("engineers can't record or change a result, even their own", async () => {
    const eng = fx.id("eng");
    expect(await failure(eng, INSERT_RESULT, [...resultValues(fx.id("enr_eng"), eng, eng)])).toMatch(
      /row-level security/,
    );
    expect(
      await count(fx.id("eng2"), "UPDATE gate_results SET outcome = 'pass_focus', focus_items = '{x}'"),
    ).toBe(0);
  });

  it("a manager of the team records and updates as themselves; never as someone else", async () => {
    const manager = fx.id("manager");
    await as(manager, async (db) => {
      await db.query(INSERT_RESULT, [...resultValues(fx.id("enr_eng"), fx.id("eng"), manager)]);
      const updated = await db.query(
        "UPDATE gate_results SET outcome = 'repeat', repeat_weeks = '{2,3}', updated_at = now() WHERE user_id = $1",
        [fx.id("eng")],
      );
      expect(updated.rowCount).toBe(1);
    });
    expect(
      await failure(manager, INSERT_RESULT, [
        ...resultValues(fx.id("enr_eng"), fx.id("eng"), fx.id("other")),
      ]),
    ).toMatch(/row-level security/);
    expect(await failure(manager, "UPDATE gate_results SET round = 5")).toMatch(/permission denied/);
    expect(await failure(manager, "DELETE FROM gate_results")).toMatch(/permission denied/);
  });

  it("another team's manager and admins can't record; admins read everything, others nothing", async () => {
    expect(
      await failure(fx.id("other"), INSERT_RESULT, [
        ...resultValues(fx.id("enr_eng"), fx.id("eng"), fx.id("other")),
      ]),
    ).toMatch(/row-level security/);
    expect(
      await failure(fx.id("admin"), INSERT_RESULT, [
        ...resultValues(fx.id("enr_eng"), fx.id("eng"), fx.id("admin")),
      ]),
    ).toMatch(/row-level security/);
    expect(
      await count(fx.id("manager"), "UPDATE gate_results SET note = 'Hijack.' WHERE user_id = $1", [
        fx.id("eng2"),
      ]),
    ).toBe(0);
    const sql = "SELECT user_id FROM gate_results WHERE user_id = $1";
    expect(await rows(fx.id("eng2"), sql, [fx.id("eng2")])).toHaveLength(1);
    expect(await rows(fx.id("admin"), sql, [fx.id("eng2")])).toHaveLength(1);
    expect(await rows(fx.id("manager"), sql, [fx.id("eng2")])).toEqual([]);
    expect(await rows(fx.id("eng"), sql, [fx.id("eng2")])).toEqual([]);
  });

  it("a repeat needs exactly 2 different weeks of the gate; pass_focus needs focus items", async () => {
    const bad = (outcome: string, weeks: string, focus: string) =>
      failure(
        fx.id("manager"),
        `INSERT INTO gate_results ${RESULT_COLUMNS}
           VALUES ($1, $2, 1, 1, now(), 3, 2, 1, true, $4, $5, $6, 'red', 'Note.', $3)`,
        [fx.id("enr_eng"), fx.id("eng"), fx.id("manager"), outcome, focus, weeks],
      );
    expect(await bad("repeat", "{2}", "{}")).toMatch(/gate_results_values_valid/);
    expect(await bad("repeat", "{2,2}", "{}")).toMatch(/gate_results_values_valid/);
    expect(await bad("repeat", "{4,5}", "{}")).toMatch(/gate_results_values_valid/);
    expect(await bad("pass", "{2,3}", "{}")).toMatch(/gate_results_values_valid/);
    expect(await bad("pass_focus", "{}", "{}")).toMatch(/gate_results_values_valid/);
  });

  it("the engineer sees who recorded it (name only, through author_names)", async () => {
    const names = await rows(fx.id("eng2"), "SELECT id, name FROM app.author_names($1::uuid[])", [
      [fx.id("other"), fx.id("manager")],
    ]);
    expect(names).toEqual([{ id: fx.id("other"), name: `other ${fx.tag}` }]);
  });
});

describe("gate criteria in rubric_scores", () => {
  const INSERT_SCORE = `INSERT INTO rubric_scores (enrollment_id, user_id, scored_by, source, day, criterion, score, round)
    VALUES ($1, $2, $3, $4, 20, 11, 3, 1)`;

  it("a manager of the team writes gate scores as themselves; never mock self-scores", async () => {
    const manager = fx.id("manager");
    await as(manager, async (db) => {
      await db.query(INSERT_SCORE, [fx.id("enr_eng"), fx.id("eng"), manager, "gate"]);
      const updated = await db.query(
        "UPDATE rubric_scores SET score = 4 WHERE user_id = $1 AND source = 'gate'",
        [fx.id("eng")],
      );
      expect(updated.rowCount).toBe(1);
      expect((await db.query("DELETE FROM rubric_scores WHERE user_id = $1", [fx.id("eng")])).rowCount).toBe(
        0,
      );
    });
    expect(
      await failure(manager, INSERT_SCORE, [fx.id("enr_eng"), fx.id("eng"), manager, "mock_self"]),
    ).toMatch(/row-level security/);
    expect(
      await failure(manager, INSERT_SCORE, [fx.id("enr_eng"), fx.id("eng"), fx.id("other"), "gate"]),
    ).toMatch(/row-level security/);
  });

  it("engineers and other teams' managers can't write gate scores", async () => {
    expect(
      await failure(fx.id("eng"), INSERT_SCORE, [fx.id("enr_eng"), fx.id("eng"), fx.id("eng"), "gate"]),
    ).toMatch(/row-level security/);
    expect(
      await failure(fx.id("other"), INSERT_SCORE, [fx.id("enr_eng"), fx.id("eng"), fx.id("other"), "gate"]),
    ).toMatch(/row-level security/);
  });
});
