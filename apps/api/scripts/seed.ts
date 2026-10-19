/**
 * Local demo data: two teams, one admin, two managers, four engineers.
 * Refuses to run against anything but a local database.
 * Sign in with the "Local test login" using any of these emails (DEV_LOGIN_ENABLED=true).
 */
import pg from "pg";
import { loadLocalEnv } from "./lib/env.js";
import { firstRow } from "./lib/first-row.js";

loadLocalEnv();

const url = process.env.DIRECT_URL ?? "";
// Test accounts use the reserved test domain; real people sign in with Google.
const domain = "test.local";

if (!/@(127\.0\.0\.1|localhost):/.test(url)) {
  console.error("Seed refused: DIRECT_URL is not a local database.");
  process.exit(1);
}

const people = [
  { key: "admin", name: "Content Admin", role: "admin" },
  { key: "priya", name: "Priya Rao", role: "manager" },
  { key: "omar", name: "Omar Haddad", role: "manager" },
  { key: "aarav", name: "Aarav Sharma", role: "engineer", team: "Platform", start: "2026-11-04" },
  { key: "meera", name: "Meera Kapoor", role: "engineer", team: "Platform", start: "2026-10-12" },
  { key: "rohan", name: "Rohan Patel", role: "engineer", team: "Platform", start: "2026-10-20" },
  { key: "neha", name: "Neha Thomas", role: "engineer", team: "Claims", start: "2026-09-01" },
] as const;

async function main(): Promise<void> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");
    const teams = new Map<string, string>();
    for (const name of ["Platform", "Claims"]) {
      const team = firstRow(
        await client.query<{ id: string }>(
          "INSERT INTO teams (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = excluded.name RETURNING id",
          [name],
        ),
        `team ${name}`,
      );
      teams.set(name, team.id);
    }
    const ids = new Map<string, string>();
    for (const person of people) {
      const email = `${person.key}@${domain}`;
      const user = firstRow(
        await client.query<{ id: string }>(
          `INSERT INTO users (email, name, role, status) VALUES ($1, $2, $3, 'active')
           ON CONFLICT (email) DO UPDATE SET name = excluded.name RETURNING id`,
          [email, person.name, person.role],
        ),
        `user ${email}`,
      );
      ids.set(person.key, user.id);
      if ("team" in person) {
        await client.query(
          "INSERT INTO team_members (user_id, team_id) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET team_id = excluded.team_id",
          [user.id, teams.get(person.team)],
        );
        await client.query(
          "INSERT INTO enrollments (user_id, start_date) VALUES ($1, $2) ON CONFLICT (user_id, cycle_no) DO NOTHING",
          [user.id, person.start],
        );
      }
    }
    await client.query(
      "INSERT INTO team_managers (team_id, user_id) VALUES ($1, $2), ($3, $4) ON CONFLICT DO NOTHING",
      [teams.get("Platform"), ids.get("priya"), teams.get("Claims"), ids.get("omar")],
    );
    await client.query("COMMIT");
    console.warn(
      `Seeded ${people.length} users on @${domain}: ${people.map((p) => `${p.key}@${domain}`).join(", ")}`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
