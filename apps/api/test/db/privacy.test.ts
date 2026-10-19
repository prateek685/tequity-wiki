/**
 * Privacy and access tests against a real Postgres (docs/PORTAL_PLAN.md §5 and §12).
 *
 * Fixtures are created with the owner connection (DIRECT_URL). Every assertion then runs as the
 * restricted `app_user` (DATABASE_URL) inside a transaction that sets app.user_id — exactly like
 * the app — and is rolled back afterwards, so tests cannot affect each other.
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// These tests create and delete fixtures (and briefly toggle a trigger during cleanup):
// never run them against a shared or production database.
if (!/@(127\.0\.0\.1|localhost):/.test(process.env.DIRECT_URL ?? "")) {
  throw new Error("Database tests refuse to run: DIRECT_URL is not a local database.");
}

const owner = new pg.Pool({ connectionString: process.env.DIRECT_URL });
const app = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const TAG = `t${Date.now().toString(36)}`;
const ids: Record<string, string> = {};

/** A fixture id created in beforeAll; fails loudly if a test uses one that does not exist. */
function id(key: string): string {
  const value = ids[key];
  if (!value) throw new Error(`fixture "${key}" was not created`);
  return value;
}

function firstId(result: pg.QueryResult<{ id: string }>): string {
  const row = result.rows[0];
  if (!row) throw new Error("insert returned no row");
  return row.id;
}

/** Run `work` as `userId` (or with no identity) in a rolled-back transaction on the app role. */
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

async function count(db: pg.PoolClient, sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await db.query<{ n: string }>(`SELECT count(*)::text AS n FROM (${sql}) q`, params);
  return Number(rows[0]?.n ?? 0);
}

async function createUser(key: string, role: string | null, status: string): Promise<string> {
  return firstId(
    await owner.query<{ id: string }>(
      "INSERT INTO users (email, name, role, status) VALUES ($1, $2, $3, $4) RETURNING id",
      [`${key.toLowerCase()}-${TAG}@test.local`, `${key} ${TAG}`, role, status],
    ),
  );
}

beforeAll(async () => {
  ids.admin = await createUser("admin", "admin", "active");
  ids.managerA = await createUser("managerA", "manager", "active");
  ids.managerB = await createUser("managerB", "manager", "active");
  ids.engA1 = await createUser("engA1", "engineer", "active");
  ids.engA2 = await createUser("engA2", "engineer", "active");
  ids.engB1 = await createUser("engB1", "engineer", "active");
  ids.pending = await createUser("pending", null, "pending");
  ids.disabledAdmin = await createUser("disabledAdmin", "admin", "disabled");

  const team = async (name: string) =>
    firstId(
      await owner.query<{ id: string }>("INSERT INTO teams (name) VALUES ($1) RETURNING id", [
        `${name} ${TAG}`,
      ]),
    );
  ids.teamA = await team("Team A");
  ids.teamB = await team("Team B");

  await owner.query("INSERT INTO team_members (user_id, team_id) VALUES ($1, $4), ($2, $4), ($3, $5)", [
    ids.engA1,
    ids.engA2,
    ids.engB1,
    ids.teamA,
    ids.teamB,
  ]);
  await owner.query("INSERT INTO team_managers (team_id, user_id) VALUES ($1, $2), ($3, $4)", [
    ids.teamA,
    ids.managerA,
    ids.teamB,
    ids.managerB,
  ]);
  for (const key of ["engA1", "engA2", "engB1"]) {
    ids[`enr_${key}`] = firstId(
      await owner.query<{ id: string }>(
        "INSERT INTO enrollments (user_id, start_date) VALUES ($1, '2026-11-04') RETURNING id",
        [id(key)],
      ),
    );
  }
});

afterAll(async () => {
  await owner.query("DELETE FROM audit_log WHERE actor_id = ANY($1::uuid[])", [Object.values(ids)]);
  await owner.query("DELETE FROM teams WHERE name LIKE $1", [`% ${TAG}`]);
  // Bypass the last-admin trigger for cleanup of our own fixtures only.
  await owner.query("ALTER TABLE users DISABLE TRIGGER users_guard_last_admin");
  await owner.query("DELETE FROM users WHERE email LIKE $1", [`%-${TAG}@test.local`]);
  await owner.query("ALTER TABLE users ENABLE TRIGGER users_guard_last_admin");
  await Promise.all([owner.end(), app.end()]);
});

describe("database role", () => {
  it("app_user cannot bypass row-level security and owns no tables", async () => {
    const { rows } = await owner.query<{ rolbypassrls: boolean; rolsuper: boolean }>(
      "SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = 'app_user'",
    );
    expect(rows[0]).toEqual({ rolbypassrls: false, rolsuper: false });
    const owned = await owner.query(
      "SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tableowner IN ('app_user', 'app_rw')",
    );
    expect(owned.rowCount).toBe(0);
  });

  it("Supabase API roles have no access to our tables", async () => {
    const { rows } = await owner.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM information_schema.role_table_grants
       WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')`,
    );
    expect(Number(rows[0]?.n)).toBe(0);
  });
});

describe("without an identity", () => {
  it("sees nothing", async () => {
    await as(null, async (db) => {
      for (const table of [
        "users",
        "teams",
        "team_members",
        "team_managers",
        "enrollments",
        "pauses",
        "settings",
        "audit_log",
      ]) {
        expect(await count(db, `SELECT 1 FROM ${table}`), table).toBe(0);
      }
    });
  });
});

describe("engineer", () => {
  it("sees only their own user row, team and enrollment", async () => {
    await as(id("engA1"), async (db) => {
      expect(await count(db, "SELECT 1 FROM users")).toBe(1);
      expect(await count(db, "SELECT 1 FROM users WHERE id = $1", [ids.engA2])).toBe(0);
      expect(await count(db, "SELECT 1 FROM teams")).toBe(1);
      expect(await count(db, "SELECT 1 FROM team_members")).toBe(1);
      expect(await count(db, "SELECT 1 FROM enrollments")).toBe(1);
      expect(await count(db, "SELECT 1 FROM enrollments WHERE user_id = $1", [ids.engB1])).toBe(0);
    });
  });

  it("can see who manages their team, but not other teams", async () => {
    await as(id("engA1"), async (db) => {
      expect(await count(db, "SELECT 1 FROM team_managers WHERE team_id = $1", [ids.teamA])).toBe(1);
      expect(await count(db, "SELECT 1 FROM team_managers WHERE team_id = $1", [ids.teamB])).toBe(0);
    });
  });

  it("cannot change roles, create users, enroll, or read the audit log", async () => {
    await as(id("engA1"), async (db) => {
      const update = await db.query("UPDATE users SET role = 'admin' WHERE id = $1", [ids.engA1]);
      expect(update.rowCount).toBe(0);
    });
    await as(id("engA1"), async (db) => {
      await expect(db.query("INSERT INTO users (email, name) VALUES ('x@test.local', 'x')")).rejects.toThrow(
        /permission denied/,
      );
    });
    await as(id("engA1"), async (db) => {
      await expect(
        db.query("INSERT INTO enrollments (user_id, start_date, cycle_no) VALUES ($1, '2026-12-01', 2)", [
          ids.engA1,
        ]),
      ).rejects.toThrow(/row-level security/);
    });
    await as(id("engA1"), async (db) => {
      expect(await count(db, "SELECT 1 FROM audit_log")).toBe(0);
      await expect(db.query("INSERT INTO audit_log (action, entity) VALUES ('x', 'y')")).rejects.toThrow(
        /permission denied/,
      );
    });
  });

  it("can read settings", async () => {
    await as(id("engA1"), async (db) => {
      expect(await count(db, "SELECT 1 FROM settings WHERE key = 'assessment.passPercent'")).toBe(1);
      const write = await db.query("UPDATE settings SET value = '10' WHERE key = 'assessment.passPercent'");
      expect(write.rowCount).toBe(0);
    });
  });

  it("manages their own pauses, which move the target date; not someone else's", async () => {
    await as(id("engA1"), async (db) => {
      await db.query(
        "INSERT INTO pauses (enrollment_id, from_date, to_date, reason) VALUES ($1, '2026-12-24', '2026-12-26', 'Leave')",
        [ids.enr_engA1],
      );
      const { rows } = await db.query<{ target: string }>(
        "SELECT target_date::text AS target FROM enrollments WHERE id = $1",
        [ids.enr_engA1],
      );
      expect(rows[0]?.target).toBe("2027-02-05"); // 2026-11-04 + 90 days + 3 pause days
    });
    await as(id("engA1"), async (db) => {
      await expect(
        db.query(
          "INSERT INTO pauses (enrollment_id, from_date, to_date, reason) VALUES ($1, '2026-12-24', '2026-12-24', 'x')",
          [ids.enr_engB1],
        ),
      ).rejects.toThrow(/row-level security/);
    });
  });
});

describe("manager", () => {
  it("sees engineers on their own team only", async () => {
    await as(id("managerA"), async (db) => {
      const { rows } = await db.query<{ id: string }>("SELECT id FROM users WHERE id <> $1", [ids.managerA]);
      const visible = rows.map((row) => row.id).sort();
      expect(visible).toEqual([ids.engA1, ids.engA2].sort());
      expect(await count(db, "SELECT 1 FROM enrollments")).toBe(2);
      expect(await count(db, "SELECT 1 FROM team_members")).toBe(2);
      expect(await count(db, "SELECT 1 FROM teams")).toBe(1);
    });
  });

  it("cannot see admins, other managers or other teams' engineers", async () => {
    await as(id("managerA"), async (db) => {
      expect(
        await count(db, "SELECT 1 FROM users WHERE id = ANY($1::uuid[])", [
          [ids.admin, ids.managerB, ids.engB1],
        ]),
      ).toBe(0);
    });
  });

  it("cannot change users, teams or memberships, and cannot read the audit log", async () => {
    await as(id("managerA"), async (db) => {
      expect(
        (await db.query("UPDATE users SET status = 'disabled' WHERE id = $1", [ids.engA1])).rowCount,
      ).toBe(0);
      expect((await db.query("DELETE FROM team_members WHERE user_id = $1", [ids.engA1])).rowCount).toBe(0);
      expect(await count(db, "SELECT 1 FROM audit_log")).toBe(0);
    });
    await as(id("managerA"), async (db) => {
      await expect(db.query("INSERT INTO teams (name) VALUES ('rogue')")).rejects.toThrow(
        /row-level security/,
      );
    });
  });

  it("can read but not add pauses for their engineers", async () => {
    await as(id("managerA"), async (db) => {
      await expect(
        db.query(
          "INSERT INTO pauses (enrollment_id, from_date, to_date, reason) VALUES ($1, '2026-12-24', '2026-12-24', 'x')",
          [ids.enr_engA1],
        ),
      ).rejects.toThrow(/row-level security/);
    });
  });
});

describe("admin", () => {
  it("sees everyone and can change roles, with an audit entry", async () => {
    await as(id("admin"), async (db) => {
      expect(await count(db, "SELECT 1 FROM users WHERE email LIKE $1", [`%-${TAG}@test.local`])).toBe(8);
      const update = await db.query("UPDATE users SET role = 'manager' WHERE id = $1", [ids.engA2]);
      expect(update.rowCount).toBe(1);
      await db.query("SELECT app.audit('user.role_changed', 'user', $1, '{}'::jsonb, '{}'::jsonb)", [
        ids.engA2,
      ]);
      const { rows } = await db.query<{ actor_id: string }>(
        "SELECT actor_id FROM audit_log WHERE entity_id = $1",
        [ids.engA2],
      );
      expect(rows[0]?.actor_id).toBe(ids.admin);
    });
  });

  it("cannot edit or delete audit entries", async () => {
    await as(id("admin"), async (db) => {
      await expect(db.query("DELETE FROM audit_log")).rejects.toThrow(/permission denied/);
    });
  });

  it("cannot remove the last active admin", async () => {
    await as(id("admin"), async (db) => {
      // Inside this rolled-back transaction, disable every other admin first...
      await db.query(
        "UPDATE users SET status = 'disabled' WHERE role = 'admin' AND status = 'active' AND id <> $1",
        [ids.admin],
      );
      // ...then demoting ourselves must fail.
      await expect(db.query("UPDATE users SET role = 'engineer' WHERE id = $1", [ids.admin])).rejects.toThrow(
        /LAST_ADMIN/,
      );
    });
  });

  it("can only put engineers in teams and managers over teams", async () => {
    await as(id("admin"), async (db) => {
      await expect(
        db.query("INSERT INTO team_members (user_id, team_id) VALUES ($1, $2)", [ids.managerB, ids.teamA]),
      ).rejects.toThrow(/TEAM_MEMBER_MUST_BE_ENGINEER/);
    });
    await as(id("admin"), async (db) => {
      await expect(
        db.query("INSERT INTO team_managers (user_id, team_id) VALUES ($1, $2)", [ids.engB1, ids.teamA]),
      ).rejects.toThrow(/TEAM_MANAGER_MUST_BE_MANAGER/);
    });
  });
});

describe("pending and disabled users", () => {
  it("a pending user sees only their own row and no settings", async () => {
    await as(id("pending"), async (db) => {
      expect(await count(db, "SELECT 1 FROM users")).toBe(1);
      expect(await count(db, "SELECT 1 FROM settings")).toBe(0);
    });
  });

  it("a disabled admin has no admin powers", async () => {
    await as(id("disabledAdmin"), async (db) => {
      expect(await count(db, "SELECT 1 FROM users")).toBe(1);
      expect(await count(db, "SELECT 1 FROM audit_log")).toBe(0);
      expect(
        (await db.query("UPDATE users SET status = 'active' WHERE id = $1", [ids.disabledAdmin])).rowCount,
      ).toBe(0);
    });
  });
});

describe("sign-in function", () => {
  it("creates new users as engineers enrolled today, and only emails in the locked bootstrap table as admin", async () => {
    await owner.query("INSERT INTO app.bootstrap_admin_emails (email) VALUES ($1)", [
      `boot-${TAG}@test.local`,
    ]);
    try {
      await as(null, async (db) => {
        const engineerRow = await db.query<{ id: string; role: string | null; status: string }>(
          "SELECT id, role, status FROM app.upsert_login_user($1, 'New Person', 'sub-new')",
          [`new-${TAG}@test.local`],
        );
        const engineer = engineerRow.rows[0];
        expect(engineer).toMatchObject({ role: "engineer", status: "active" });
        // The new engineer can start at once: they see their own enrollment.
        await db.query("SELECT set_config('app.user_id', $1, true)", [engineer?.id]);
        const enrollment = await db.query("SELECT 1 FROM enrollments WHERE user_id = $1", [engineer?.id]);
        expect(enrollment.rowCount).toBe(1);
        await db.query("SELECT set_config('app.user_id', '', true)");

        const adminRow = await db.query<{ role: string | null; status: string }>(
          "SELECT role, status FROM app.upsert_login_user($1, 'Boot Admin', 'sub-boot')",
          [`boot-${TAG}@test.local`],
        );
        expect(adminRow.rows[0]).toEqual({ role: "admin", status: "active" });
      });
    } finally {
      await owner.query("DELETE FROM app.bootstrap_admin_emails WHERE email = $1", [
        `boot-${TAG}@test.local`,
      ]);
    }
  });

  it("no longer accepts an 'initial admin' flag from the app", async () => {
    await as(null, async (db) => {
      await expect(
        db.query("SELECT * FROM app.upsert_login_user('x@test.local', 'x', 'sub', true)"),
      ).rejects.toThrow(/does not exist/);
    });
  });

  it("the app role cannot read or change the bootstrap admin list", async () => {
    await as(null, async (db) => {
      await expect(db.query("SELECT 1 FROM app.bootstrap_admin_emails")).rejects.toThrow(/permission denied/);
    });
    await as(id("admin"), async (db) => {
      await expect(
        db.query("INSERT INTO app.bootstrap_admin_emails (email) VALUES ('me@test.local')"),
      ).rejects.toThrow(/permission denied/);
    });
  });

  it("rejects mixed-case emails at the database level", async () => {
    await expect(
      owner.query(
        "INSERT INTO users (email, name, role, status) VALUES ('Mixed@Test.local', 'x', 'engineer', 'active')",
      ),
    ).rejects.toThrow(/users_email_lowercase/);
  });

  it("matches existing users case-insensitively and does not change their role on sign-in", async () => {
    await as(null, async (db) => {
      const row = await db.query<{ role: string | null }>(
        "SELECT role FROM app.upsert_login_user($1, 'x', null)",
        [`ENGA1-${TAG}@TEST.LOCAL`],
      );
      expect(row.rows[0]?.role).toBe("engineer");
    });
  });

  it("refuses a different Google account for an existing email", async () => {
    await owner.query("UPDATE users SET google_sub = 'sub-original' WHERE id = $1", [id("engA2")]);
    await as(null, async (db) => {
      await expect(
        db.query("SELECT * FROM app.upsert_login_user($1, 'x', 'sub-someone-else')", [
          `enga2-${TAG}@test.local`,
        ]),
      ).rejects.toThrow(/ACCOUNT_MISMATCH/);
    });
  });

  it("does not touch a disabled account at sign-in", async () => {
    await as(null, async (db) => {
      const { rows } = await db.query<{ status: string }>(
        "SELECT status FROM app.upsert_login_user($1, 'x', null)",
        [`disabledadmin-${TAG}@test.local`],
      );
      expect(rows[0]?.status).toBe("disabled");
    });
    const { rows } = await owner.query<{ last_login_at: Date | null }>(
      "SELECT last_login_at FROM users WHERE id = $1",
      [id("disabledAdmin")],
    );
    expect(rows[0]?.last_login_at).toBeNull();
  });
});

describe("hardening", () => {
  it("app_user cannot read or write sessions directly, only through the session functions", async () => {
    await as(id("admin"), async (db) => {
      await expect(db.query("SELECT 1 FROM app.sessions")).rejects.toThrow(/permission denied/);
    });
  });

  it("app_user cannot create temporary tables (no search_path shadowing)", async () => {
    await as(id("engA1"), async (db) => {
      await expect(
        db.query("CREATE TEMP TABLE users (id uuid, role user_role, status user_status)"),
      ).rejects.toThrow(/permission denied/);
    });
  });

  it("every SECURITY DEFINER function pins pg_temp last in its search_path", async () => {
    const { rows } = await owner.query<{ fn: string; config: string[] | null }>(
      `SELECT p.oid::regprocedure::text AS fn, p.proconfig AS config
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'app' AND p.prosecdef`,
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.config, row.fn).toContain("search_path=pg_catalog, public, pg_temp");
    }
  });

  it("the app can call only the functions it needs", async () => {
    await as(id("engA1"), async (db) => {
      for (const call of [
        "SELECT app.compute_target_date(gen_random_uuid())",
        "SELECT app.setting_int('plan.targetDays', 90)",
        "SELECT app.guard_last_admin()",
        "SELECT app.end_sessions_on_disable()",
      ]) {
        await db.query("SAVEPOINT s");
        await expect(db.query(call), call).rejects.toThrow(/permission denied/);
        await db.query("ROLLBACK TO SAVEPOINT s");
      }
    });
  });

  it("audit accepts only known actions from active users", async () => {
    await as(id("admin"), async (db) => {
      await expect(db.query("SELECT app.audit('hack.anything', 'x', null, null, null)")).rejects.toThrow(
        /AUDIT_UNKNOWN_ACTION/,
      );
    });
    await as(id("pending"), async (db) => {
      await expect(db.query("SELECT app.audit('user.role_changed', 'x', null, null, null)")).rejects.toThrow(
        /AUDIT_REQUIRES_ACTIVE_USER/,
      );
    });
  });
});

describe("pause rules", () => {
  const addPause = (db: pg.PoolClient, from: string, to: string) =>
    db.query("INSERT INTO pauses (enrollment_id, from_date, to_date, reason) VALUES ($1, $2, $3, 'Leave')", [
      id("enr_engA1"),
      from,
      to,
    ]);

  it("rejects overlapping pauses", async () => {
    await as(id("engA1"), async (db) => {
      await addPause(db, "2026-12-01", "2026-12-05");
      await expect(addPause(db, "2026-12-05", "2026-12-07")).rejects.toThrow(/pauses_no_overlap/);
    });
  });

  it("rejects pauses before the start date or longer than the limit", async () => {
    await as(id("engA1"), async (db) => {
      await db.query("SAVEPOINT s");
      await expect(addPause(db, "2026-10-01", "2026-10-02")).rejects.toThrow(/PAUSE_BEFORE_START/);
      await db.query("ROLLBACK TO SAVEPOINT s");
      await expect(addPause(db, "2026-12-01", "2027-02-01")).rejects.toThrow(/PAUSE_TOO_LONG/);
    });
  });
});

describe("last-admin guard under concurrency", () => {
  it("two admins disabling each other at the same time cannot both succeed", async () => {
    // Make the two fixture admins the only active admins for the duration of this test.
    const { rows: others } = await owner.query<{ id: string }>(
      "SELECT id FROM users WHERE role = 'admin' AND status = 'active' AND id <> $1",
      [id("admin")],
    );
    ids.admin2 = await createUser("admin2", "admin", "active");
    await owner.query("UPDATE users SET status = 'disabled' WHERE id = ANY($1::uuid[])", [
      others.map((o) => o.id),
    ]);

    const first = await app.connect();
    const second = await app.connect();
    try {
      await first.query("BEGIN");
      await first.query("SELECT set_config('app.user_id', $1, true)", [id("admin")]);
      await second.query("BEGIN");
      await second.query("SELECT set_config('app.user_id', $1, true)", [id("admin2")]);

      const secondPid = (await second.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]?.pid;

      await first.query("UPDATE users SET status = 'disabled' WHERE id = $1", [id("admin2")]);
      // Starts while admin2 is still an admin (first has not committed) and must block on the guard's lock.
      const secondUpdate = second.query("UPDATE users SET status = 'disabled' WHERE id = $1", [id("admin")]);
      const secondOutcome = secondUpdate.then(
        () => "updated",
        (error: unknown) => (error instanceof Error ? error.message : String(error)),
      );
      // Wait until the second transaction is really waiting on the advisory lock.
      for (let attempt = 0; attempt < 100; attempt++) {
        const { rows } = await owner.query<{ waiting: boolean }>(
          "SELECT wait_event_type = 'Lock' AS waiting FROM pg_stat_activity WHERE pid = $1",
          [secondPid],
        );
        if (rows[0]?.waiting) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      await first.query("COMMIT");
      // After the lock is released, the guard re-checks with a fresh snapshot and refuses.
      expect(await secondOutcome).toMatch(/LAST_ADMIN/);
      await second.query("ROLLBACK");

      const { rows } = await owner.query<{ n: string }>(
        "SELECT count(*)::text AS n FROM users WHERE role = 'admin' AND status = 'active'",
      );
      expect(Number(rows[0]?.n)).toBeGreaterThanOrEqual(1);
    } finally {
      first.release();
      second.release();
      await owner.query("UPDATE users SET status = 'active' WHERE id = ANY($1::uuid[])", [
        others.map((o) => o.id),
      ]);
    }
  });
});
