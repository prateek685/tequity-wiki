/**
 * Privacy of manager v1 (docs/PORTAL_PLAN.md §1 "Privacy", §5 "Privacy is enforced in the database"):
 * manual_unlocks, checkins and checkin_preps, the fact that a manager can't read written answers or AI scores, and
 * the numbers-only functions. Fixtures are written with the owner connection; every assertion runs as
 * `app_user` with app.user_id set, in a rolled-back transaction, exactly like the API.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Fixtures } from "../fixtures.js";

const fx = new Fixtures("mp");
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

const rows = (userId: string, sql: string, params: unknown[] = []) =>
  as(userId, async (db) => (await db.query<Record<string, unknown>>(sql, params)).rows);

const WRITTEN = JSON.stringify({ type: "written", stem: "Write it." });
const POINTS = JSON.stringify([{ point: "Answer first", verdict: "met" }]);
const BASELINE_LESSON = "baseline-fixture";

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
      "INSERT INTO enrollments (user_id, start_date) VALUES ($1, '2026-09-01') RETURNING id",
      [fx.id(key)],
    );
  }
  const question = await fx.owner.query<{ id: string }>("SELECT id FROM questions LIMIT 1");
  const questionId = question.rows[0]?.id;
  if (!questionId) throw new Error("no question imported: run pnpm content:import");
  const eng = fx.id("eng");
  const enr = fx.id("enr_eng");
  for (const kind of ["assessment", "daily"]) {
    const attempt = await fx.insertId(
      `attempt_${kind}`,
      "INSERT INTO quiz_attempts (enrollment_id, user_id, kind, day) VALUES ($1, $2, $3, 5) RETURNING id",
      [enr, eng, kind],
    );
    await fx.insertId(
      `item_${kind}`,
      `INSERT INTO quiz_items (attempt_id, user_id, kind, position, question_id, question_version, question_data, text_answer, answered_at)
       VALUES ($1, $2, $3, 0, $4, 1, $5, 'my private answer', now()) RETURNING id`,
      [attempt, eng, kind, questionId, WRITTEN],
    );
    await fx.insertId(
      `score_${kind}`,
      `INSERT INTO ai_scores (enrollment_id, user_id, day, target, quiz_item_id, status, score, points, reason,
         better_sentence, model, prompt_version, attempts, scored_at)
       VALUES ($1, $2, 5, 'quiz_item', $3, 'scored', 4, $4, 'Feedback ${kind}.', 'Better.', 'fake', 'v1', 1, now())
       RETURNING id`,
      [enr, eng, fx.id(`item_${kind}`), POINTS],
    );
  }
  await fx.owner.query(
    `INSERT INTO ai_scores (enrollment_id, user_id, day, target, lesson_id, status, score, points, reason,
       better_sentence, model, prompt_version, attempts, scored_at)
     VALUES ($1, $2, 2, 'lesson', 'rewrite', 'scored', 3, $3, 'Write feedback.', 'Better.', 'fake', 'v1', 1, now())`,
    [enr, eng, POINTS],
  );
  await fx.owner.query(
    `INSERT INTO step_entries (enrollment_id, user_id, day, lesson_id, entry) VALUES
       ($1, $2, 1, $3, '{"values": {"why": "private text"}, "ratings": {"U1": 2, "C1": 4, "X": "text"}}'),
       ($1, $2, 1, 'journal', '{"values": {"note": "private journal"}}')`,
    [enr, eng, BASELINE_LESSON],
  );
  await fx.owner.query(
    `INSERT INTO manual_unlocks (enrollment_id, user_id, manager_id, kind, day, reason)
     VALUES ($1, $2, $3, 'next_day', 6, 'Sick last week.')`,
    [enr, eng, fx.id("manager")],
  );
  await fx.owner.query(
    `INSERT INTO checkins (enrollment_id, user_id, manager_id, after_day, held_on, rag, note)
     VALUES ($1, $2, $3, 10, '2026-09-20', 'green', 'On track.')`,
    [enr, eng, fx.id("manager")],
  );
  await fx.owner.query(
    `INSERT INTO checkin_preps (enrollment_id, user_id, after_day, stuck) VALUES ($1, $2, 10, 'Private note.')`,
    [enr, eng],
  );
});

afterAll(async () => {
  await fx.cleanup();
  await app.end();
});

const TABLES = ["manual_unlocks", "checkins"] as const;

describe("manager records: who reads", () => {
  it("the engineer, a manager of their team and admins read them", async () => {
    for (const key of ["eng", "manager", "admin"]) {
      for (const table of TABLES) {
        expect(
          await rows(fx.id(key), `SELECT 1 FROM ${table} WHERE user_id = $1`, [fx.id("eng")]),
        ).toHaveLength(1);
      }
    }
  });

  it("another engineer and a manager of another team read nothing", async () => {
    for (const key of ["eng2", "other"]) {
      for (const table of TABLES) {
        expect(await rows(fx.id(key), `SELECT 1 FROM ${table}`)).toEqual([]);
      }
    }
  });
});

describe("manager records: who writes", () => {
  const unlock = `INSERT INTO manual_unlocks (enrollment_id, user_id, manager_id, kind, day, reason)
    VALUES ($1, $2, $3, 'next_day', 7, 'Reason.')`;
  const checkin = `INSERT INTO checkins (enrollment_id, user_id, manager_id, after_day, held_on, rag, note)
    VALUES ($1, $2, $3, 30, '2026-10-01', 'amber', 'Note.')`;

  it("a manager of the team adds them as themselves", async () => {
    const eng = fx.id("eng");
    const me = fx.id("manager");
    expect(await failure(me, unlock, [fx.id("enr_eng"), eng, me])).toBe("");
    expect(await failure(me, checkin, [fx.id("enr_eng"), eng, me])).toBe("");
  });

  it("not in someone else's name, not on a daily-quiz answer", async () => {
    const eng = fx.id("eng");
    const me = fx.id("manager");
    const other = fx.id("other");
    expect(await failure(me, unlock, [fx.id("enr_eng"), eng, other])).toMatch(/row-level security/);
    expect(await failure(me, checkin, [fx.id("enr_eng"), eng, other])).toMatch(/row-level security/);
  });

  it("engineers, other teams' managers and admins can't add them", async () => {
    const eng = fx.id("eng");
    for (const key of ["eng", "eng2", "other", "admin"]) {
      const who = fx.id(key);
      expect(await failure(who, unlock, [fx.id("enr_eng"), eng, who])).toMatch(/row-level security/);
      expect(await failure(who, checkin, [fx.id("enr_eng"), eng, who])).toMatch(/row-level security/);
    }
    // Not even about themselves.
    const eng2 = fx.id("eng2");
    expect(await failure(eng2, unlock, [fx.id("enr_eng2"), eng2, eng2])).toMatch(/row-level security/);
  });

  it("unlocks are append-only; check-ins can't be deleted or moved", async () => {
    const me = fx.id("manager");
    expect(await failure(me, "UPDATE manual_unlocks SET created_at = now()")).toMatch(/permission denied/);
    expect(await failure(me, "DELETE FROM manual_unlocks")).toMatch(/permission denied/);
    expect(await failure(me, "DELETE FROM checkins")).toMatch(/permission denied/);
    expect(await failure(me, "UPDATE checkins SET user_id = $1", [fx.id("eng2")])).toMatch(
      /permission denied/,
    );
    expect(await failure(me, "UPDATE checkins SET after_day = 30")).toMatch(/permission denied/);
  });

  it("a manager of the team updates a check-in as themselves; nobody else can", async () => {
    const update = "UPDATE checkins SET rag = 'red', manager_id = $1 WHERE user_id = $2";
    const count = (who: string) =>
      as(fx.id(who), async (db) => (await db.query(update, [fx.id(who), fx.id("eng")])).rowCount);
    expect(await count("manager")).toBe(1);
    for (const key of ["other", "eng", "admin"]) expect(await count(key)).toBe(0);
    expect(await failure(fx.id("manager"), update, [fx.id("other"), fx.id("eng")])).toMatch(
      /row-level security/,
    );
  });
});

describe("what a manager can read of the engineer's work", () => {
  it("no written answers (quiz or assessment) and no AI scores or feedback", async () => {
    for (const key of ["manager", "admin"]) {
      const me = fx.id(key);
      expect(await rows(me, "SELECT 1 FROM quiz_items WHERE user_id = $1", [fx.id("eng")])).toEqual([]);
      expect(await rows(me, "SELECT 1 FROM ai_scores WHERE user_id = $1", [fx.id("eng")])).toEqual([]);
    }
  });

  it("no lesson entries (prep, journal, write answers, mock notes)", async () => {
    for (const key of ["manager", "admin"]) {
      expect(await rows(fx.id(key), "SELECT 1 FROM step_entries WHERE user_id = $1", [fx.id("eng")])).toEqual(
        [],
      );
    }
  });

  it("a manager of another team reads none of it", async () => {
    const other = fx.id("other");
    expect(await rows(other, "SELECT 1 FROM quiz_items")).toEqual([]);
    expect(await rows(other, "SELECT 1 FROM ai_scores")).toEqual([]);
  });
});

describe("numbers-only functions", () => {
  const baseline = "SELECT behaviour, rating FROM app.baseline_ratings($1, $2) ORDER BY behaviour";
  const writes = "SELECT * FROM app.write_scores($1, 10)";

  it("give the engineer and their manager the baseline ratings and write scores, numbers only", async () => {
    for (const key of ["eng", "manager"]) {
      expect(await rows(fx.id(key), baseline, [fx.id("enr_eng"), BASELINE_LESSON])).toEqual([
        { behaviour: "C1", rating: 4 },
        { behaviour: "U1", rating: 2 },
      ]);
      const scores = await rows(fx.id(key), writes, [fx.id("enr_eng")]);
      expect(scores).toHaveLength(1);
      expect(Object.keys(scores[0] ?? {}).sort()).toEqual(["score", "scored_at"]);
      expect(scores[0]?.score).toBe(3);
    }
  });

  it("give nothing to others, nor text from any other lesson", async () => {
    for (const key of ["eng2", "other", "admin"]) {
      expect(await rows(fx.id(key), baseline, [fx.id("enr_eng"), BASELINE_LESSON])).toEqual([]);
      expect(await rows(fx.id(key), writes, [fx.id("enr_eng")])).toEqual([]);
    }
    expect(await rows(fx.id("manager"), baseline, [fx.id("enr_eng"), "journal"])).toEqual([]);
  });

  it("name the authors of records the caller may read, and nobody else", async () => {
    const names = "SELECT id, name FROM app.author_names($1::uuid[])";
    const ids = [[fx.id("manager"), fx.id("other"), fx.id("admin")]];
    for (const key of ["eng", "manager", "admin"]) {
      expect(await rows(fx.id(key), names, ids)).toEqual([
        { id: fx.id("manager"), name: `manager ${fx.tag}` },
      ]);
    }
    for (const key of ["eng2", "other"]) expect(await rows(fx.id(key), names, ids)).toEqual([]);
  });

  it("count AI scores for admins only", async () => {
    const counts = await rows(fx.id("admin"), "SELECT pending, failed FROM app.ai_score_counts()");
    expect(Object.keys(counts[0] ?? {}).sort()).toEqual(["failed", "pending"]);
    for (const key of ["manager", "eng"]) {
      expect(await failure(fx.id(key), "SELECT * FROM app.ai_score_counts()")).toMatch(/ADMIN_ONLY/);
    }
  });
});

describe("checkin_preps: the engineer's notes for a check-in", () => {
  const prep = `INSERT INTO checkin_preps (enrollment_id, user_id, after_day, stuck) VALUES ($1, $2, 30, 'Note.')`;

  it("the engineer, a manager of their team and admins read them; nobody else does", async () => {
    for (const key of ["eng", "manager", "admin"]) {
      expect(
        await rows(fx.id(key), "SELECT stuck FROM checkin_preps WHERE user_id = $1", [fx.id("eng")]),
      ).toEqual([{ stuck: "Private note." }]);
    }
    for (const key of ["eng2", "other"]) {
      expect(await rows(fx.id(key), "SELECT 1 FROM checkin_preps")).toEqual([]);
    }
  });

  it("only the engineer writes their own, on their own enrollment", async () => {
    const eng = fx.id("eng");
    expect(await failure(eng, prep, [fx.id("enr_eng"), eng])).toBe("");
    for (const key of ["manager", "other", "admin", "eng2"]) {
      expect(await failure(fx.id(key), prep, [fx.id("enr_eng"), eng])).toMatch(/row-level security/);
    }
    // Not on someone else's enrollment, even as themselves.
    expect(await failure(eng, prep, [fx.id("enr_eng2"), eng])).toMatch(/row-level security/);
  });

  it("the engineer edits them until the check-in is recorded, then they are locked", async () => {
    const eng = fx.id("eng");
    const edit = (day: number) =>
      as(eng, async (db) => {
        await db.query(prep, [fx.id("enr_eng"), eng]);
        const sql = "UPDATE checkin_preps SET stuck = 'Changed.' WHERE after_day = $1";
        return (await db.query(sql, [day])).rowCount;
      });
    expect(await edit(30)).toBe(1);
    // Day 10 has a recorded check-in.
    expect(await edit(10)).toBe(0);
  });

  it("nobody else edits them, and nobody deletes or moves them", async () => {
    const edit = "UPDATE checkin_preps SET stuck = 'X'";
    for (const key of ["manager", "other", "admin", "eng2"]) {
      expect(await as(fx.id(key), async (db) => (await db.query(edit)).rowCount)).toBe(0);
    }
    const eng = fx.id("eng");
    expect(await failure(eng, "DELETE FROM checkin_preps")).toMatch(/permission denied/);
    expect(await failure(eng, "UPDATE checkin_preps SET user_id = $1", [fx.id("eng2")])).toMatch(
      /permission denied/,
    );
    expect(await failure(eng, "UPDATE checkin_preps SET after_day = 30")).toMatch(/permission denied/);
  });
});
