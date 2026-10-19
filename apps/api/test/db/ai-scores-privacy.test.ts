/**
 * Privacy of AI scores (docs/M2_SPEC.md "AI scoring" → Privacy). Fixtures are written with the owner
 * connection; every assertion runs as `app_user` with app.user_id set (or, for the worker functions,
 * without it), in a rolled-back transaction, exactly like the API and the worker.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Fixtures } from "../fixtures.js";

const fx = new Fixtures("ai");
const app = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function as<T>(userId: string | null, work: (db: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await app.connect();
  try {
    await client.query("BEGIN");
    if (userId) await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    return await work(client);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

/** Run a statement as `userId` and return the error message ("" when it succeeded). */
async function failure(userId: string | null, sql: string, params: unknown[] = []): Promise<string> {
  return as(userId, async (db) => {
    try {
      await db.query(sql, params);
      return "";
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });
}

const POINTS = JSON.stringify([{ point: "Answer first", verdict: "met" }]);

beforeAll(async () => {
  await fx.user("admin", "admin", "active");
  await fx.user("manager", "manager", "active");
  await fx.user("eng", "engineer", "active");
  await fx.user("eng2", "engineer", "active");
  const team = await fx.team("team");
  await fx.owner.query("INSERT INTO team_members (user_id, team_id) VALUES ($1, $3), ($2, $3)", [
    fx.id("eng"),
    fx.id("eng2"),
    team,
  ]);
  await fx.owner.query("INSERT INTO team_managers (team_id, user_id) VALUES ($1, $2)", [
    team,
    fx.id("manager"),
  ]);
  for (const key of ["eng", "eng2"]) {
    await fx.insertId(
      `enr_${key}`,
      "INSERT INTO enrollments (user_id, start_date) VALUES ($1, '2026-10-01') RETURNING id",
      [fx.id(key)],
    );
  }
  // Question D01-91 may not exist outside the content fixtures; use any existing question id.
  const question = await fx.owner.query<{ id: string }>("SELECT id FROM questions LIMIT 1");
  const questionId = question.rows[0]?.id;
  if (!questionId) throw new Error("no question imported: run pnpm content:import");
  const eng = fx.id("eng");
  const enr = fx.id("enr_eng");
  const attempt = await fx.insertId(
    "attempt",
    "INSERT INTO quiz_attempts (enrollment_id, user_id, kind, day) VALUES ($1, $2, 'assessment', 5) RETURNING id",
    [enr, eng],
  );
  for (const position of [0, 1]) {
    await fx.insertId(
      `item${position}`,
      `INSERT INTO quiz_items (attempt_id, user_id, kind, position, question_id, question_version, question_data, text_answer, score_status, answered_at)
       VALUES ($1, $2, 'assessment', $3, $4, 1, '{}', 'my private answer', 'pending', now()) RETURNING id`,
      [attempt, eng, position, questionId],
    );
  }
  await fx.insertId(
    "scored",
    `INSERT INTO ai_scores (enrollment_id, user_id, day, target, quiz_item_id, status, score, points, reason,
       better_sentence, model, prompt_version, attempts, scored_at)
     VALUES ($1, $2, 5, 'quiz_item', $3, 'scored', 4, $4, 'Private feedback.', 'A better sentence.', 'fake', 'score-v1', 1, now())
     RETURNING id`,
    [enr, eng, fx.id("item0"), POINTS],
  );
  await fx.insertId(
    "pending",
    `INSERT INTO ai_scores (enrollment_id, user_id, day, target, lesson_id, status)
     VALUES ($1, $2, 2, 'lesson', 'rewrite', 'pending') RETURNING id`,
    [enr, eng],
  );
});

afterAll(async () => {
  await fx.cleanup();
  await app.end();
});

describe("ai_scores: who reads", () => {
  const sql = "SELECT reason, better_sentence, score FROM ai_scores WHERE user_id = $1";

  it("the engineer reads their own scores and feedback", async () => {
    const rows = await as(
      fx.id("eng"),
      async (db) => (await db.query<Record<string, unknown>>(sql, [fx.id("eng")])).rows,
    );
    expect(rows).toHaveLength(2);
    expect(rows).toContainEqual({
      reason: "Private feedback.",
      better_sentence: "A better sentence.",
      score: 4,
    });
  });

  it("another engineer reads nothing", async () => {
    const rows = await as(
      fx.id("eng2"),
      async (db) => (await db.query<Record<string, unknown>>(sql, [fx.id("eng")])).rows,
    );
    expect(rows).toEqual([]);
  });

  it("their manager and an admin read no AI scores or feedback", async () => {
    for (const key of ["manager", "admin"]) {
      const rows = await as(
        fx.id(key),
        async (db) => (await db.query<Record<string, unknown>>(sql, [fx.id("eng")])).rows,
      );
      expect(rows).toEqual([]);
    }
  });

  it("without a user identity, nothing is readable", async () => {
    expect(await as(null, async (db) => (await db.query("SELECT 1 FROM ai_scores")).rowCount)).toBe(0);
  });
});

describe("ai_scores: the engineer can't set a score", () => {
  it("can't insert a scored row or a pending row with a score", async () => {
    const scored = `INSERT INTO ai_scores (enrollment_id, user_id, day, target, lesson_id, status, score, points, reason,
        better_sentence, model, prompt_version, scored_at)
      VALUES ($1, $2, 3, 'lesson', 'x', 'scored', 5, $3, 'r', 'b', 'm', 'v', now())`;
    expect(await failure(fx.id("eng"), scored, [fx.id("enr_eng"), fx.id("eng"), POINTS])).toMatch(
      /row-level security/,
    );
    const withScore = `INSERT INTO ai_scores (enrollment_id, user_id, day, target, lesson_id, status, score)
      VALUES ($1, $2, 3, 'lesson', 'x', 'pending', 5)`;
    expect(await failure(fx.id("eng"), withScore, [fx.id("enr_eng"), fx.id("eng")])).toMatch(
      /row-level security|ai_scores_result_valid/,
    );
  });

  it("can't update a row to scored, nor change who or what it is for", async () => {
    const toScored = `UPDATE ai_scores SET status = 'scored', score = 5, points = $2, reason = 'r', better_sentence = 'b',
        model = 'm', prompt_version = 'v', scored_at = now() WHERE id = $1`;
    expect(await failure(fx.id("eng"), toScored, [fx.id("pending"), POINTS])).toMatch(/row-level security/);
    expect(
      await failure(fx.id("eng"), "UPDATE ai_scores SET score = 1 WHERE id = $1", [fx.id("scored")]),
    ).toMatch(/row-level security/);
    expect(
      await failure(fx.id("eng"), "UPDATE ai_scores SET user_id = $2 WHERE id = $1", [
        fx.id("pending"),
        fx.id("eng2"),
      ]),
    ).toMatch(/permission denied/);
    expect(await failure(fx.id("eng"), "DELETE FROM ai_scores WHERE id = $1", [fx.id("pending")])).toMatch(
      /permission denied/,
    );
  });

  it("can ask for a new score of their own answer (reset to pending, result cleared)", async () => {
    const reset = `UPDATE ai_scores SET status = 'pending', revision = revision + 1, score = NULL, points = NULL,
        reason = NULL, better_sentence = NULL, model = NULL, prompt_version = NULL, attempts = 0, scored_at = NULL
      WHERE id = $1`;
    expect(await failure(fx.id("eng"), reset, [fx.id("scored")])).toBe("");
  });

  it("nobody can create or change a score for someone else", async () => {
    const insert = `INSERT INTO ai_scores (enrollment_id, user_id, day, target, lesson_id, status)
      VALUES ($1, $2, 3, 'lesson', 'x', 'pending')`;
    for (const key of ["eng2", "manager", "admin"]) {
      expect(await failure(fx.id(key), insert, [fx.id("enr_eng"), fx.id("eng")])).toMatch(
        /row-level security/,
      );
      expect(await failure(fx.id(key), insert, [fx.id("enr_eng"), fx.id(key)])).toMatch(/row-level security/);
      const updated = await as(fx.id(key), async (db) => {
        const result = await db.query("UPDATE ai_scores SET status = 'pending' WHERE user_id = $1", [
          fx.id("eng"),
        ]);
        return result.rowCount;
      });
      expect(updated).toBe(0);
    }
    // Not on another engineer's quiz item either, even on one's own enrollment.
    const onItem = `INSERT INTO ai_scores (enrollment_id, user_id, day, target, quiz_item_id, status)
      VALUES ($1, $2, 5, 'quiz_item', $3, 'pending')`;
    expect(await failure(fx.id("eng2"), onItem, [fx.id("enr_eng2"), fx.id("eng2"), fx.id("item1")])).toMatch(
      /row-level security/,
    );
  });
});

describe("worker functions", () => {
  it("record a score only on a pending row of the same revision, and keep quiz_items in sync", async () => {
    const record = (id: string, revision: number, score = 4) =>
      as(null, async (db) => {
        const { rows } = await db.query<{ saved: boolean }>(
          "SELECT app.ai_score_record($1, $2, $3, $4, 'Good.', 'Better.', false, 'fake', 'score-v1', 1) AS saved",
          [id, revision, score, POINTS],
        );
        const status = await db.query<{ status: string }>(
          "SELECT s.status FROM ai_scores s WHERE s.id = $1",
          [id],
        );
        return { saved: rows[0]?.saved, visible: status.rowCount };
      });
    expect((await record(fx.id("pending"), 2)).saved).toBe(false);
    expect((await record(fx.id("scored"), 1)).saved).toBe(false);
    // Saved, and still invisible to a caller without an identity.
    expect(await record(fx.id("pending"), 1)).toEqual({ saved: true, visible: 0 });
    expect(
      await failure(null, "SELECT app.ai_score_record($1, 1, 9, '[]', 'r', 'b', false, 'm', 'v', 1)", [
        fx.id("pending"),
      ]),
    ).toMatch(/AI_SCORE_INVALID/);
  });

  it("mirror the item's status in quiz_items.score_status (not_scored shows as failed)", async () => {
    const item = fx.id("item1");
    const status = async (db: pg.PoolClient) =>
      (await db.query<{ s: string }>("SELECT score_status AS s FROM quiz_items WHERE id = $1", [item]))
        .rows[0]?.s;
    await as(fx.id("eng"), async (db) => {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO ai_scores (enrollment_id, user_id, day, target, quiz_item_id, status)
         VALUES ($1, $2, 5, 'quiz_item', $3, 'not_scored') RETURNING id`,
        [fx.id("enr_eng"), fx.id("eng"), item],
      );
      expect(await status(db)).toBe("failed");
      await db.query("UPDATE ai_scores SET status = 'pending' WHERE id = $1", [rows[0]?.id]);
      expect(await status(db)).toBe("pending");
      await db.query("SELECT app.ai_score_fail($1, 1, 3)", [rows[0]?.id]);
      expect(await status(db)).toBe("failed");
    });
  });

  it("list stale pending rows by id, owner and revision only (no text), for the sweep", async () => {
    await fx.owner.query("UPDATE ai_scores SET updated_at = now() - interval '11 minutes' WHERE id = $1", [
      fx.id("pending"),
    ]);
    const rows = await as(
      null,
      async (db) =>
        (await db.query<Record<string, unknown>>("SELECT * FROM app.ai_scores_stale_pending('10 minutes')"))
          .rows,
    );
    expect(rows).toContainEqual({ id: fx.id("pending"), user_id: fx.id("eng"), revision: 1 });
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(["id", "revision", "user_id"]);
    expect(await failure(null, "SELECT * FROM app.ai_scores_stale_pending('5 seconds')")).toMatch(
      /AI_SCORE_SWEEP_TOO_SOON/,
    );
  });
});
