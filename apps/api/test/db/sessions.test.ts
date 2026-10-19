/**
 * Session functions (migration 20261007090000_sessions), called as the restricted app role exactly
 * like the API does. Only token hashes are stored; the app role can't touch the table directly.
 */
import { createHash, randomBytes } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Fixtures } from "../fixtures.js";

const fx = new Fixtures("s");
const app = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const newToken = () => createHash("sha256").update(randomBytes(32)).digest();

async function create(userId: string, token: Buffer, lifetime = "7 days"): Promise<void> {
  await app.query("SELECT app.create_session($1, $2, $3::interval)", [userId, token, lifetime]);
}

async function lookup(token: Buffer, idle = "12 hours"): Promise<{ id: string; role: string | null }[]> {
  const { rows } = await app.query<{ id: string; role: string | null }>(
    "SELECT id, role::text AS role FROM app.session_user_by_token($1, $2::interval)",
    [token, idle],
  );
  return rows;
}

beforeAll(async () => {
  await fx.user("eng", "engineer", "active");
  await fx.user("pending", null, "pending");
  await fx.user("disabled", "engineer", "disabled");
});

afterAll(async () => {
  await fx.cleanup();
  await app.end();
});

describe("sessions", () => {
  it("creates a session and finds the user by token, with role read from the database", async () => {
    const token = newToken();
    await create(fx.id("eng"), token);
    expect(await lookup(token)).toEqual([{ id: fx.id("eng"), role: "engineer" }]);

    await fx.owner.query("UPDATE users SET role = 'manager' WHERE id = $1", [fx.id("eng")]);
    expect(await lookup(token)).toEqual([{ id: fx.id("eng"), role: "manager" }]);
    await fx.owner.query("UPDATE users SET role = 'engineer' WHERE id = $1", [fx.id("eng")]);
  });

  it("stores only the token hash, never the token", async () => {
    const token = newToken();
    await create(fx.id("eng"), token);
    const { rows } = await fx.owner.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM app.sessions WHERE token_hash = $1",
      [token],
    );
    expect(rows[0]?.n).toBe("1");
  });

  it("gives pending users a session (to see the waiting page) but refuses disabled users", async () => {
    await create(fx.id("pending"), newToken());
    await expect(create(fx.id("disabled"), newToken())).rejects.toThrow(/SESSION_USER_INVALID/);
  });

  it("rejects unknown, expired and idle sessions", async () => {
    expect(await lookup(newToken())).toEqual([]);

    const expired = newToken();
    await create(fx.id("eng"), expired);
    await fx.owner.query(
      "UPDATE app.sessions SET expires_at = now() - interval '1 second' WHERE token_hash = $1",
      [expired],
    );
    expect(await lookup(expired)).toEqual([]);

    const idle = newToken();
    await create(fx.id("eng"), idle);
    await fx.owner.query(
      "UPDATE app.sessions SET last_seen_at = now() - interval '13 hours' WHERE token_hash = $1",
      [idle],
    );
    expect(await lookup(idle)).toEqual([]);
  });

  it("refuses unreasonable lifetimes", async () => {
    await expect(create(fx.id("eng"), newToken(), "90 days")).rejects.toThrow(/SESSION_LIFETIME_INVALID/);
  });

  it("deletes a session on logout", async () => {
    const token = newToken();
    await create(fx.id("eng"), token);
    await app.query("SELECT app.delete_session($1)", [token]);
    expect(await lookup(token)).toEqual([]);
  });

  it("signs a user out everywhere the moment they are disabled", async () => {
    const tokens = [newToken(), newToken()];
    for (const token of tokens) await create(fx.id("eng"), token);
    await fx.owner.query("UPDATE users SET status = 'disabled' WHERE id = $1", [fx.id("eng")]);
    const { rows } = await fx.owner.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM app.sessions WHERE user_id = $1",
      [fx.id("eng")],
    );
    expect(rows[0]?.n).toBe("0");
    await fx.owner.query("UPDATE users SET status = 'active' WHERE id = $1", [fx.id("eng")]);
  });
});
