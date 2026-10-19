import pg from "pg";

/**
 * Test fixtures created with the owner connection (DIRECT_URL) and tagged so cleanup removes only
 * this run's rows. Each test file creates its own `Fixtures`.
 */
export class Fixtures {
  readonly owner = new pg.Pool({ connectionString: process.env.DIRECT_URL });
  readonly tag: string;
  private readonly ids = new Map<string, string>();

  /** `domain`: tests that sign in through the API need the company domain (ALLOWED_EMAIL_DOMAIN). */
  constructor(
    prefix: string,
    private readonly domain = "test.local",
  ) {
    this.tag = `${prefix}${Date.now().toString(36)}`;
  }

  /** A fixture id; fails loudly if a test uses one that was not created. */
  id(key: string): string {
    const value = this.ids.get(key);
    if (!value) throw new Error(`fixture "${key}" was not created`);
    return value;
  }

  emailOf(key: string): string {
    return `${key.toLowerCase()}-${this.tag}@${this.domain}`;
  }

  async insertId(key: string, sql: string, params: unknown[]): Promise<string> {
    const row = (await this.owner.query<{ id: string }>(sql, params)).rows[0];
    if (!row) throw new Error(`insert for "${key}" returned no row`);
    this.ids.set(key, row.id);
    return row.id;
  }

  user(key: string, role: string | null, status: string): Promise<string> {
    return this.insertId(
      key,
      "INSERT INTO users (email, name, role, status) VALUES ($1, $2, $3, $4) RETURNING id",
      [this.emailOf(key), `${key} ${this.tag}`, role, status],
    );
  }

  team(key: string): Promise<string> {
    return this.insertId(key, "INSERT INTO teams (name) VALUES ($1) RETURNING id", [`${key} ${this.tag}`]);
  }

  /** Remove this run's rows. The last-admin trigger is bypassed for our own fixtures only. */
  async cleanup(): Promise<void> {
    await this.owner.query("DELETE FROM audit_log WHERE actor_id = ANY($1::uuid[])", [
      [...this.ids.values()],
    ]);
    await this.owner.query("DELETE FROM teams WHERE name LIKE $1", [`% ${this.tag}`]);
    await this.owner.query("ALTER TABLE users DISABLE TRIGGER users_guard_last_admin");
    await this.owner.query("DELETE FROM users WHERE email LIKE $1", [`%-${this.tag}@${this.domain}`]);
    await this.owner.query("ALTER TABLE users ENABLE TRIGGER users_guard_last_admin");
    await this.owner.end();
  }
}
