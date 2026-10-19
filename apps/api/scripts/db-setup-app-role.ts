/**
 * Creates (or updates) the login role the application connects with, verifies it cannot bypass
 * row-level security, and loads the bootstrap admin emails (INITIAL_ADMIN_EMAILS) into the locked
 * app.bootstrap_admin_emails table used by sign-in.
 *
 * `app_user` is a member of `app_rw` (created by the RLS migration): no BYPASSRLS, not a table
 * owner, so every query it runs is filtered by row-level security. Run after `prisma migrate deploy`
 * (the `pnpm db:migrate` script does both). Uses DIRECT_URL (owner) and APP_DB_PASSWORD.
 */
import pg from "pg";
import { loadLocalEnv, requireEnv } from "./lib/env.js";
import { firstRow } from "./lib/first-row.js";

loadLocalEnv();

async function main(): Promise<void> {
  const client = new pg.Client({ connectionString: requireEnv("DIRECT_URL") });
  const password = requireEnv("APP_DB_PASSWORD");
  await client.connect();
  try {
    const { rows } = await client.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') AS exists",
    );
    const verb = rows[0]?.exists ? "ALTER" : "CREATE";
    // Identifiers are fixed; the password is passed as a quoted literal via format().
    // CREATE sets every safety attribute. ALTER only rotates the password: changing attributes such
    // as NOSUPERUSER on an existing role needs a real superuser, which managed hosts (e.g. Supabase) don't give.
    const template =
      verb === "CREATE"
        ? "CREATE ROLE app_user LOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L"
        : "ALTER ROLE app_user LOGIN PASSWORD %L";
    const statement = firstRow(
      await client.query<{ stmt: string }>("SELECT format($1::text, $2::text) AS stmt", [template, password]),
      "role statement",
    );
    await client.query(statement.stmt);
    await client.query("GRANT app_rw TO app_user");

    const { rows: attrs } = await client.query<{
      rolsuper: boolean;
      rolbypassrls: boolean;
      rolcreaterole: boolean;
    }>("SELECT rolsuper, rolbypassrls, rolcreaterole FROM pg_roles WHERE rolname = 'app_user'");
    const role = attrs[0];
    if (!role || role.rolsuper || role.rolbypassrls || role.rolcreaterole) {
      throw new Error(
        "app_user has unsafe attributes (superuser, BYPASSRLS or CREATEROLE). Fix it before running the app.",
      );
    }

    const emails = (process.env.INITIAL_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    await client.query("BEGIN");
    await client.query("DELETE FROM app.bootstrap_admin_emails");
    for (const email of emails) {
      await client.query("INSERT INTO app.bootstrap_admin_emails (email) VALUES ($1)", [email]);
    }
    await client.query("COMMIT");

    console.warn(
      `app_user ${verb === "CREATE" ? "created" : "updated"} (no superuser, no BYPASSRLS); ${emails.length} bootstrap admin email(s) loaded.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
