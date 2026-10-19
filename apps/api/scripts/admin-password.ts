/**
 * Create an admin account or set its sign-in password.
 *
 *   pnpm admin:set-password [email]      asks for the password at a hidden prompt (works for resets too)
 *   ADMIN_EMAIL + ADMIN_PASSWORD         non-interactive; `pnpm db:migrate` runs this with --if-missing,
 *                                        so a new deployment only has to set these two variables
 *
 * --if-missing: do nothing unless ADMIN_EMAIL and ADMIN_PASSWORD are both set and that admin has no
 * password yet, so re-running a deploy never overwrites a password the admin chose later.
 * Runs as the database owner (DIRECT_URL). Never prints the password.
 */
import { createInterface } from "node:readline";
import { ADMIN_PASSWORD_MIN_LENGTH } from "@portal/contracts";
import pg from "pg";
import { loadLocalEnv } from "./lib/env.js";
import { hashPassword } from "../src/auth/password.js";

loadLocalEnv();

const MIN_LENGTH = ADMIN_PASSWORD_MIN_LENGTH;

type MutableOutput = { _writeToOutput: (text: string) => void };

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const target = rl as unknown as MutableOutput;
    const write = target._writeToOutput;
    process.stdout.write(question);
    target._writeToOutput = (text) => {
      if (text.includes("\n") || text.includes("\r")) write.call(rl, text);
    };
    rl.question("", (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function readPassword(): Promise<string> {
  const fromEnv = process.env.ADMIN_PASSWORD;
  if (fromEnv) return fromEnv;
  const password = await askHidden(`New password (min ${MIN_LENGTH} characters): `);
  if (password !== (await askHidden("Repeat password: "))) throw new Error("Passwords do not match.");
  return password;
}

async function main(): Promise<void> {
  const ifMissing = process.argv.includes("--if-missing");
  const email = (process.argv.find((a, i) => i >= 2 && !a.startsWith("--")) ?? process.env.ADMIN_EMAIL ?? "")
    .trim()
    .toLowerCase();
  if (ifMissing && (!email || !process.env.ADMIN_PASSWORD)) return;
  if (!email.includes("@")) throw new Error("Usage: pnpm admin:set-password <admin email>");
  const url = process.env.DIRECT_URL;
  if (!url) throw new Error("DIRECT_URL is not set.");

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    if (ifMissing) {
      const existing = await client.query(
        `SELECT 1 FROM app.admin_credentials c JOIN public.users u ON u.id = c.user_id WHERE u.email = $1`,
        [email],
      );
      if (existing.rowCount) return;
    }
    const password = await readPassword();
    if (password.length < MIN_LENGTH) {
      throw new Error(`Password must be at least ${MIN_LENGTH} characters.`);
    }
    const user = await client.query<{ id: string }>(
      `INSERT INTO public.users (email, name, role, status) VALUES ($1, $2, 'admin', 'active')
       ON CONFLICT (email) DO UPDATE SET role = 'admin', status = 'active' RETURNING id`,
      [email, email.split("@")[0]],
    );
    await client.query(
      `INSERT INTO app.admin_credentials (user_id, password_hash) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET password_hash = excluded.password_hash, updated_at = now()`,
      [user.rows[0]?.id, await hashPassword(password)],
    );
    console.warn(`Admin ${email} can now sign in with email and password.`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
