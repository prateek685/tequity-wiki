/**
 * `pnpm content:check` — validate every file in content/ and cross-check them (docs/PORTAL_PLAN.md §6).
 * Exits 1 when there is any problem, so CI fails.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkContent } from "./check.js";
import { loadContent } from "./load.js";

const repoRoot = resolve(import.meta.dirname, "../../..");
const contentDir = resolve(repoRoot, "content");
const pdfTextPath = resolve(repoRoot, "docs/pdf-text.txt");

const { bundle, problems } = loadContent(contentDir);
const pdfText = existsSync(pdfTextPath) ? readFileSync(pdfTextPath, "utf8") : "";
if (!pdfText)
  problems.push("docs/pdf-text.txt: missing (the PDF's extracted text, used to check question quotes)");
problems.push(...checkContent(bundle, pdfText));

const questions = bundle.pools.reduce((sum, pool) => sum + pool.questions.length, 0);
console.log(
  `content: ${bundle.days.length} days, ${bundle.blocks.length} blocks, ${bundle.cards.length} cards, ` +
    `${bundle.library.length} library entries, ${bundle.pools.length} question pools (${questions} questions)`,
);
if (problems.length > 0) {
  for (const problem of problems) console.error(`✗ ${problem}`);
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}
console.log("✓ content OK");
