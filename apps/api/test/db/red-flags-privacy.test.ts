/**
 * Privacy and behaviour of red flags and manager emails (migration 20261011091000_red_flags): red_flags
 * (management view: managers of the team and admins read, managers acknowledge only; engineers can't
 * read their own), email_log (admins read only) and the system-only worker functions. Fixtures are written
 * with the owner connection; assertions run as `app_user`, with app.user_id set in a rolled-back
 * transaction like the API, or without it like the worker.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Fixtures } from "../fixtures.js";

const fx = new Fixtures("rf");
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

/** As the worker: app_user without a user identity. */
const system = async <T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) =>
  (await app.query<T>(sql, params)).rows;

const sync = (enrollment: string, signals: object[], hold: object[] = []) =>
  system<{ raised: number }>("SELECT app.red_flags_sync($1, $2::jsonb, $3::jsonb) AS raised", [
    enrollment,
    JSON.stringify(signals),
    JSON.stringify(hold),
  ]).then((r) => r[0]?.raised);

const ownerRows = async (sql: string, params: unknown[]) =>
  (await fx.owner.query<Record<string, unknown>>(sql, params)).rows;

const LOW = { kind: "pillar_low", key: "own", detail: "Own: 2, 2, 1 (Weeks 2–4)" };
const GATE = { kind: "gate_not_passed", key: "gate1-round1", detail: "Gate 1, round 1" };

beforeAll(async () => {
  await fx.user("admin", "admin", "active");
  await fx.user("manager", "manager", "active");
  await fx.user("comanager", "manager", "active");
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
  await fx.owner.query("INSERT INTO team_managers (team_id, user_id) VALUES ($1, $2), ($1, $3), ($4, $5)", [
    team,
    fx.id("manager"),
    fx.id("comanager"),
    otherTeam,
    fx.id("other"),
  ]);
  for (const key of ["eng", "eng2"]) {
    await fx.insertId(
      `enr_${key}`,
      "INSERT INTO enrollments (user_id, start_date) VALUES ($1, '2026-09-01') RETURNING id",
      [fx.id(key)],
    );
  }
  await fx.insertId(
    "flag",
    `INSERT INTO red_flags (enrollment_id, user_id, kind, key, detail) VALUES ($1, $2, 'scorecard_missing', '', 'No new scorecard for 15 days') RETURNING id`,
    [fx.id("enr_eng"), fx.id("eng")],
  );
  await fx.owner.query(
    `INSERT INTO email_log (recipient_id, template, dedupe_key, payload) VALUES ($1, 'red_flag', $2, '{}')`,
    [fx.id("manager"), `test:${fx.tag}`],
  );
});

afterAll(async () => {
  await app.end();
  await fx.cleanup();
});

describe("red_flags", () => {
  const SQL = "SELECT id FROM red_flags WHERE user_id = $1";

  it("engineers can't read their own flags (management view)", async () => {
    expect(await rows(fx.id("eng"), SQL, [fx.id("eng")])).toEqual([]);
    expect(await rows(fx.id("eng"), "SELECT count(*)::int AS n FROM red_flags")).toEqual([{ n: 0 }]);
  });

  it("managers of the team and admins read; another team's manager sees nothing", async () => {
    expect(await rows(fx.id("manager"), SQL, [fx.id("eng")])).toHaveLength(1);
    expect(await rows(fx.id("admin"), SQL, [fx.id("eng")])).toHaveLength(1);
    expect(await rows(fx.id("other"), SQL, [fx.id("eng")])).toEqual([]);
  });

  it("a manager of the team only acknowledges, as themselves", async () => {
    const ack = "UPDATE red_flags SET acknowledged_at = now(), acknowledged_by = $1 WHERE id = $2";
    await as(fx.id("manager"), async (db) => {
      expect((await db.query(ack, [fx.id("manager"), fx.id("flag")])).rowCount).toBe(1);
    });
    expect(await failure(fx.id("manager"), ack, [fx.id("comanager"), fx.id("flag")])).toMatch(
      /row-level security/,
    );
    for (const sql of [
      "UPDATE red_flags SET detail = 'Changed'",
      "UPDATE red_flags SET cleared_at = now()",
      "UPDATE red_flags SET kind = 'pillar_low'",
      "DELETE FROM red_flags",
      `INSERT INTO red_flags (enrollment_id, user_id, kind, detail) VALUES ('${fx.id("enr_eng")}', '${fx.id("eng")}', 'pillar_low', 'x')`,
    ]) {
      expect(await failure(fx.id("manager"), sql)).toMatch(/permission denied/);
    }
    // Not their team, or not a manager: nothing to update.
    for (const who of ["other", "eng", "admin"]) {
      expect(
        await as(fx.id(who), async (db) => (await db.query(ack, [fx.id(who), fx.id("flag")])).rowCount),
      ).toBe(0);
    }
  });

  it("an acknowledged flag can't be acknowledged again (the first one stays)", async () => {
    await fx.owner.query("UPDATE red_flags SET acknowledged_at = now(), acknowledged_by = $1 WHERE id = $2", [
      fx.id("manager"),
      fx.id("flag"),
    ]);
    const count = await as(
      fx.id("comanager"),
      async (db) =>
        (
          await db.query("UPDATE red_flags SET acknowledged_at = now(), acknowledged_by = $1 WHERE id = $2", [
            fx.id("comanager"),
            fx.id("flag"),
          ])
        ).rowCount,
    );
    expect(count).toBe(0);
  });
});

describe("email_log", () => {
  it("only admins read it", async () => {
    const sql = "SELECT id FROM email_log WHERE recipient_id = $1";
    expect(await rows(fx.id("admin"), sql, [fx.id("manager")])).toHaveLength(1);
    for (const who of ["manager", "eng", "other"]) {
      expect(await rows(fx.id(who), sql, [fx.id("manager")])).toEqual([]);
    }
    expect(await failure(fx.id("admin"), "UPDATE email_log SET status = 'sent'")).toMatch(
      /permission denied/,
    );
    expect(await failure(fx.id("admin"), "DELETE FROM email_log")).toMatch(/permission denied/);
  });
});

describe("worker functions", () => {
  it("refuse to run with a user identity, whoever asks", async () => {
    const calls = [
      "SELECT * FROM app.red_flag_candidates()",
      `SELECT app.red_flags_sync('${fx.id("enr_eng")}', '[]', '[]')`,
      "SELECT * FROM app.email_pending_recipients()",
      `SELECT * FROM app.email_pending('${fx.id("manager")}')`,
      "SELECT app.email_mark('{}'::uuid[], 'sent')",
    ];
    for (const who of ["admin", "manager", "eng"]) {
      for (const sql of calls) expect(await failure(fx.id(who), sql)).toMatch(/SYSTEM_ONLY/);
    }
    expect(await failure(fx.id("admin"), `SELECT * FROM app.managers_of('${fx.id("eng")}')`)).toMatch(
      /permission denied/,
    );
  });

  it("raise a flag once, clear it when the signal goes, raise it again when it comes back", async () => {
    const enrollment = fx.id("enr_eng2");
    expect(await sync(enrollment, [LOW, GATE])).toBe(2);
    expect(await sync(enrollment, [LOW, GATE])).toBe(0);
    const open =
      "SELECT kind, key, cleared_at FROM red_flags WHERE enrollment_id = $1 ORDER BY raised_at, kind";
    expect((await ownerRows(open, [enrollment])).filter((r) => r.cleared_at === null)).toHaveLength(2);

    // The pillar recovers: its flag clears; the held signal stays as it is.
    expect(await sync(enrollment, [], [{ kind: "gate_not_passed", key: "gate1-round1" }])).toBe(0);
    const after = await ownerRows(open, [enrollment]);
    expect(after.find((r) => r.kind === "pillar_low")?.cleared_at).not.toBeNull();
    expect(after.find((r) => r.kind === "gate_not_passed")?.cleared_at).toBeNull();

    // It comes back: a new row.
    expect(await sync(enrollment, [LOW, GATE])).toBe(1);
    expect(
      await ownerRows("SELECT id FROM red_flags WHERE enrollment_id = $1 AND kind = 'pillar_low'", [
        enrollment,
      ]),
    ).toHaveLength(2);
    // Invalid kinds are refused by the table.
    await expect(sync(enrollment, [{ kind: "late", key: "", detail: "x" }])).rejects.toThrow(
      /red_flags_values_valid/,
    );
  });

  it("save one email item per new flag and manager of the team, never twice", async () => {
    const items = await ownerRows(
      "SELECT recipient_id, template, payload FROM email_log WHERE payload->>'engineerId' = $1",
      [fx.id("eng2")],
    );
    // 3 flags raised for eng2 (pillar_low twice, gate once), one manager ("other").
    expect(items).toHaveLength(3);
    expect(items.every((i) => i.recipient_id === fx.id("other") && i.template === "red_flag")).toBe(true);
    expect(items[0]?.payload).toMatchObject({ engineerName: `eng2 ${fx.tag}` });
  });

  it("hand pending items to the sender and mark them once", async () => {
    const pending = await system<{ id: string; template: string; active: boolean }>(
      "SELECT id, template, active FROM app.email_pending($1)",
      [fx.id("manager")],
    );
    expect(pending.map((p) => p.template)).toEqual(["red_flag"]);
    expect(pending.every((p) => p.active)).toBe(true);
    const recipients = await system<{ recipient_id: string }>(
      "SELECT recipient_id FROM app.email_pending_recipients()",
    );
    expect(recipients.map((r) => r.recipient_id)).toContain(fx.id("manager"));
    const ids = pending.map((p) => p.id);
    const mark = (status: string) =>
      system<{ n: number }>("SELECT app.email_mark($1::uuid[], $2) AS n", [ids, status]).then((r) => r[0]?.n);
    expect(await mark("sent")).toBe(1);
    expect(await mark("failed")).toBe(0);
    await expect(mark("pending")).rejects.toThrow(/EMAIL_STATUS_INVALID/);
    expect(await system("SELECT id FROM app.email_pending($1)", [fx.id("manager")])).toEqual([]);
  });
});
