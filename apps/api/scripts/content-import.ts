/**
 * `pnpm content:import` — load content/ into Postgres (docs/PORTAL_PLAN.md §6).
 * Validates every file and cross-checks them (same checks as `pnpm content:check`); refuses to import
 * anything if there is a single problem. Then writes everything in one transaction as the owner
 * (DIRECT_URL). Re-runnable; see src/content/content-import.ts for the versioning rules.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkContent, loadContent } from "@portal/content";
import pg from "pg";
import { loadLocalEnv, requireEnv } from "./lib/env.js";
import { importContent } from "../src/content/content-import.js";

loadLocalEnv();

const repoRoot = resolve(import.meta.dirname, "../../..");
const contentDir = resolve(repoRoot, "content");
const pdfTextPath = resolve(repoRoot, "docs/pdf-text.txt");

async function main(): Promise<void> {
  const { bundle, problems } = loadContent(contentDir);
  if (!existsSync(pdfTextPath)) problems.push("docs/pdf-text.txt: missing (needed to check question quotes)");
  else problems.push(...checkContent(bundle, readFileSync(pdfTextPath, "utf8")));
  if (problems.length > 0) {
    for (const problem of problems) console.error(`✗ ${problem}`);
    console.error(`\n${problems.length} problem(s). Nothing was imported.`);
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: requireEnv("DIRECT_URL") });
  await client.connect();
  try {
    await client.query("BEGIN");
    const s = await importContent(client, bundle);
    await client.query("COMMIT");
    console.warn(
      [
        `Imported ${s.blocks} blocks, ${s.cards} cards, ${s.library} library entries.`,
        `Days: ${s.days.added} added, ${s.days.changed} changed, ` +
          `${s.days.unchanged} unchanged, ${s.days.removed} removed.`,
        `Questions: ${s.questions.added} added, ${s.questions.changed} changed (new version), ` +
          `${s.questions.unchanged} unchanged, ${s.questions.deleted} deleted, ${s.questions.retired} retired (removed but already asked).`,
        "Everything imported is live.",
      ].join("\n"),
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
