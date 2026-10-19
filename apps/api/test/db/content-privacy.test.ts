/**
 * Privacy of the M1 content and activity tables (docs/M1_SPEC.md "Data and privacy"). Fixtures are
 * written with the owner connection; every assertion runs as `app_user` with app.user_id set, in a
 * rolled-back transaction, exactly like the API.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CARD_ID, CARD_PROMPT, ContentFixtures } from "../content-fixtures.js";
import { Fixtures } from "../fixtures.js";

const fx = new Fixtures("cp");
const content = new ContentFixtures();
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

async function count(db: pg.PoolClient, sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM (${sql}) q`, params);
  return Number(rows[0]?.n ?? 0);
}

/** Run a statement as `userId` and return the error message ("" when it succeeded). */
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

beforeAll(async () => {
  await fx.user("admin", "admin", "active");
  await fx.user("manager", "manager", "active");
  await fx.user("otherManager", "manager", "active");
  await fx.user("eng", "engineer", "active");
  await fx.user("eng2", "engineer", "active");
  const team = await fx.team("team");
  const other = await fx.team("other");
  await fx.owner.query("INSERT INTO team_members (user_id, team_id) VALUES ($1, $3), ($2, $3)", [
    fx.id("eng"),
    fx.id("eng2"),
    team,
  ]);
  await fx.owner.query("INSERT INTO team_managers (team_id, user_id) VALUES ($1, $2), ($3, $4)", [
    team,
    fx.id("manager"),
    other,
    fx.id("otherManager"),
  ]);
  for (const key of ["eng", "eng2"]) {
    await fx.insertId(
      `enr_${key}`,
      "INSERT INTO enrollments (user_id, start_date) VALUES ($1, '2026-10-01') RETURNING id",
      [fx.id(key)],
    );
  }
  await content.install();

  const eng = fx.id("eng");
  const enrollment = fx.id("enr_eng");
  await fx.owner.query(
    "INSERT INTO day_progress (enrollment_id, user_id, day, completed_at) VALUES ($1, $2, 1, now())",
    [enrollment, eng],
  );
  await fx.owner.query(
    `INSERT INTO step_entries (enrollment_id, user_id, day, lesson_id, entry)
     VALUES ($1, $2, 1, 'after-call', '{"values":{"went-well":"private notes"}}')`,
    [enrollment, eng],
  );
  await fx.owner.query(
    `INSERT INTO rubric_scores (enrollment_id, user_id, scored_by, source, day, criterion, score)
     VALUES ($1, $2, $2, 'mock_self', 1, 1, 4)`,
    [enrollment, eng],
  );
  const daily = await fx.insertId(
    "dailyAttempt",
    "INSERT INTO quiz_attempts (enrollment_id, user_id, kind, day) VALUES ($1, $2, 'daily', 1) RETURNING id",
    [enrollment, eng],
  );
  const assessment = await fx.insertId(
    "assessmentAttempt",
    `INSERT INTO quiz_attempts (enrollment_id, user_id, kind, day, completed_at, choice_correct, choice_total, passed)
     VALUES ($1, $2, 'assessment', 5, now(), 6, 8, true) RETURNING id`,
    [enrollment, eng],
  );
  await fx.owner.query(
    `INSERT INTO scorecards (enrollment_id, user_id, week, day, ratings, pillar_scores, proof, days_completed, mocks_done)
     VALUES ($1, $2, 1, 5, '{"C1": 3}', '{"communicate": 3}', '{"communicate": "proof"}', 5, 1)`,
    [enrollment, eng],
  );
  for (const [attempt, kind] of [
    [daily, "daily"],
    [assessment, "assessment"],
  ] as const) {
    await fx.owner.query(
      `INSERT INTO quiz_items (attempt_id, user_id, kind, position, question_id, question_version, question_data, text_answer)
       VALUES ($1, $2, $3, 0, 'D01-91', 1, '{}', 'an answer')`,
      [attempt, eng, kind],
    );
  }
});

afterAll(async () => {
  await fx.cleanup();
  await content.restore();
  await app.end();
});

describe("lesson entries are private to the engineer", () => {
  const sql = "SELECT 1 FROM step_entries WHERE user_id = $1";

  it("the engineer reads their own", async () => {
    expect(await as(fx.id("eng"), (db) => count(db, sql, [fx.id("eng")]))).toBe(1);
  });

  it("another engineer, their manager and an admin read nothing", async () => {
    for (const key of ["eng2", "manager", "admin"]) {
      expect(await as(fx.id(key), (db) => count(db, sql, [fx.id("eng")]))).toBe(0);
    }
  });

  it("nobody can write an entry for someone else", async () => {
    const insert = `INSERT INTO step_entries (enrollment_id, user_id, day, lesson_id, entry) VALUES ($1, $2, 2, 'rewrite', '{}')`;
    expect(await failure(fx.id("eng2"), insert, [fx.id("enr_eng"), fx.id("eng")])).toMatch(
      /row-level security/,
    );
    expect(await failure(fx.id("eng2"), insert, [fx.id("enr_eng"), fx.id("eng2")])).toMatch(
      /row-level security/,
    );
    expect(await failure(fx.id("admin"), insert, [fx.id("enr_eng"), fx.id("eng")])).toMatch(
      /row-level security/,
    );
  });
});

describe("quiz items", () => {
  const sql = "SELECT kind FROM quiz_items WHERE user_id = $1";

  it("quiz and assessment items (the answers) are private to the engineer", async () => {
    expect(await as(fx.id("eng"), (db) => count(db, sql, [fx.id("eng")]))).toBe(2);
    for (const key of ["manager", "admin", "otherManager", "eng2"]) {
      expect(await as(fx.id(key), (db) => count(db, sql, [fx.id("eng")]))).toBe(0);
    }
  });

  it("a manager of the engineer's team reads their assessment result but not the answers; another manager reads neither", async () => {
    const answers = "SELECT text_answer FROM quiz_items WHERE user_id = $1 AND kind = 'assessment'";
    const result =
      "SELECT choice_correct, passed FROM quiz_attempts WHERE user_id = $1 AND kind = 'assessment'";
    const read = (key: string, sql: string) =>
      as(fx.id(key), async (db) => (await db.query<Record<string, unknown>>(sql, [fx.id("eng")])).rows);
    expect(await read("manager", answers)).toEqual([]);
    expect(await read("manager", result)).toEqual([{ choice_correct: 6, passed: true }]);
    for (const key of ["otherManager", "eng2"]) {
      expect(await read(key, answers)).toEqual([]);
      expect(await read(key, result)).toEqual([]);
    }
  });

  it("managers can't change an assessment result; nobody can store one on a daily attempt", async () => {
    const updated = await as(fx.id("manager"), async (db) => {
      const res = await db.query("UPDATE quiz_attempts SET passed = false WHERE user_id = $1", [
        fx.id("eng"),
      ]);
      return res.rowCount;
    });
    expect(updated).toBe(0);
    const message = await failure(
      fx.id("eng"),
      "UPDATE quiz_attempts SET completed_at = now(), choice_correct = 1, choice_total = 1, passed = true WHERE id = $1",
      [fx.id("dailyAttempt")],
    );
    expect(message).toMatch(/quiz_attempts_result_valid/);
  });

  it("an item's kind must match its attempt", async () => {
    const message = await failure(
      fx.id("eng"),
      `INSERT INTO quiz_items (attempt_id, user_id, kind, position, question_id, question_version, question_data)
       VALUES ($1, $2, 'assessment', 1, 'D01-91', 1, '{}')`,
      [fx.id("dailyAttempt"), fx.id("eng")],
    );
    expect(message).toMatch(/row-level security/);
  });
});

describe("progress, attempts and rubric scores", () => {
  it("are readable by the engineer, their manager and admins, not by others", async () => {
    for (const table of ["day_progress", "quiz_attempts", "rubric_scores"]) {
      const sql = `SELECT 1 FROM ${table} WHERE user_id = $1`;
      for (const key of ["eng", "manager", "admin"]) {
        expect(await as(fx.id(key), (db) => count(db, sql, [fx.id("eng")]))).toBeGreaterThan(0);
      }
      for (const key of ["eng2", "otherManager"]) {
        expect(await as(fx.id(key), (db) => count(db, sql, [fx.id("eng")]))).toBe(0);
      }
    }
  });

  it("managers and admins can't change them", async () => {
    for (const key of ["manager", "admin"]) {
      const updated = await as(fx.id(key), async (db) => {
        const result = await db.query("UPDATE day_progress SET completed_at = NULL WHERE user_id = $1", [
          fx.id("eng"),
        ]);
        return result.rowCount;
      });
      expect(updated).toBe(0);
    }
  });
});

describe("scorecards", () => {
  const sql = "SELECT proof FROM scorecards WHERE user_id = $1";
  const insert = `INSERT INTO scorecards (enrollment_id, user_id, week, day, ratings, pillar_scores, proof, days_completed, mocks_done)
    VALUES ($1, $2, 2, 10, '{}', '{}', '{}', 0, 0)`;

  it("the engineer, their team's manager and admins read it; another manager or engineer can't", async () => {
    for (const key of ["eng", "manager", "admin"]) {
      expect(await as(fx.id(key), (db) => count(db, sql, [fx.id("eng")]))).toBe(1);
    }
    for (const key of ["otherManager", "eng2"]) {
      expect(await as(fx.id(key), (db) => count(db, sql, [fx.id("eng")]))).toBe(0);
    }
  });

  it("the engineer writes their own, on their own enrollment only", async () => {
    expect(await failure(fx.id("eng"), insert, [fx.id("enr_eng"), fx.id("eng")])).toBe("");
    expect(await failure(fx.id("eng2"), insert, [fx.id("enr_eng"), fx.id("eng2")])).toMatch(
      /row-level security/,
    );
    expect(await failure(fx.id("eng2"), insert, [fx.id("enr_eng"), fx.id("eng")])).toMatch(
      /row-level security/,
    );
  });

  it("managers and admins can't write or change it, and nobody can delete it", async () => {
    for (const key of ["manager", "admin"]) {
      expect(await failure(fx.id(key), insert, [fx.id("enr_eng"), fx.id("eng")])).toMatch(
        /row-level security/,
      );
      const updated = await as(fx.id(key), async (db) => {
        const result = await db.query("UPDATE scorecards SET win = 'x' WHERE user_id = $1", [fx.id("eng")]);
        return result.rowCount;
      });
      expect(updated).toBe(0);
    }
    expect(await failure(fx.id("eng"), "DELETE FROM scorecards WHERE user_id = $1", [fx.id("eng")])).toMatch(
      /permission denied/,
    );
  });

  it("a day must lie in its week", async () => {
    const bad = insert.replace("2, 10,", "2, 4,");
    expect(await failure(fx.id("eng"), bad, [fx.id("enr_eng"), fx.id("eng")])).toMatch(
      /scorecards_values_valid/,
    );
  });
});

describe("card prompts", () => {
  it("only admins can read the table", async () => {
    const sql = "SELECT prompt FROM content_card_prompts WHERE card_id = $1";
    expect(await as(fx.id("admin"), (db) => count(db, sql, [CARD_ID]))).toBe(1);
    for (const key of ["eng", "manager"]) {
      expect(await as(fx.id(key), (db) => count(db, sql, [CARD_ID]))).toBe(0);
    }
  });

  it("engineers (and admins) can copy a prompt through app.card_prompt(); managers can't", async () => {
    const copy = async (key: string) =>
      as(
        fx.id(key),
        async (db) =>
          (await db.query<{ p: string }>("SELECT app.card_prompt($1) AS p", [CARD_ID])).rows[0]?.p,
      );
    expect(await copy("eng")).toBe(CARD_PROMPT);
    expect(await copy("admin")).toBe(CARD_PROMPT);
    expect(await failure(fx.id("manager"), "SELECT app.card_prompt($1)", [CARD_ID])).toMatch(/FORBIDDEN/);
  });
});

describe("content", () => {
  it("every active user reads lessons and questions (everything imported is live)", async () => {
    for (const key of ["eng", "manager", "admin"]) {
      expect(await as(fx.id(key), (db) => count(db, "SELECT 1 FROM questions WHERE id = 'D01-91'"))).toBe(1);
      expect(await as(fx.id(key), (db) => count(db, "SELECT 1 FROM content_days WHERE day = 1"))).toBe(1);
    }
  });

  it("nobody in the app can change content: it comes from the import only", async () => {
    for (const key of ["eng", "admin"]) {
      for (const sql of [
        "UPDATE questions SET data = '{}' WHERE id = 'D01-91'",
        "UPDATE questions SET retired = true WHERE id = 'D01-91'",
        "UPDATE content_days SET title = 'x' WHERE day = 1",
        "DELETE FROM questions WHERE id = 'D01-91'",
        "INSERT INTO content_days (day, block_number, title, type, data, content_hash) VALUES (3, 1, 'x', 'normal', '{}', 'x')",
      ]) {
        expect(await failure(fx.id(key), sql)).toMatch(/permission denied/);
      }
    }
  });
});
