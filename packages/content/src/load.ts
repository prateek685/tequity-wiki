import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parse } from "yaml";
import { type z } from "zod";
import {
  blockFile,
  cardFile,
  type ContentBundle,
  dayFile,
  libraryFile,
  planFile,
  questionPoolFile,
} from "./files.js";

export interface LoadResult {
  bundle: ContentBundle;
  /** Files that failed to parse or didn't match their schema. */
  problems: string[];
}

function yamlFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".yaml"))
    .sort()
    .map((name) => join(dir, name));
}

function readFile<S extends z.ZodType>(
  path: string,
  schema: S,
  root: string,
  problems: string[],
): z.output<S> | null {
  const label = path.slice(root.length + 1);
  let raw: unknown;
  try {
    raw = parse(readFileSync(path, "utf8"));
  } catch (error) {
    problems.push(
      `${label}: invalid YAML (${error instanceof Error ? error.message.split("\n")[0] : "parse error"})`,
    );
    return null;
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    for (const issue of result.error.issues.slice(0, 5)) {
      problems.push(`${label}: ${issue.path.join(".") || "(file)"} — ${issue.message}`);
    }
    return null;
  }
  return result.data;
}

/** Read and validate every file under `content/`. Never throws for bad content: problems are returned. */
export function loadContent(root: string): LoadResult {
  const problems: string[] = [];
  const all = <S extends z.ZodType>(dir: string, schema: S) =>
    yamlFiles(join(root, dir))
      .map((path) => readFile(path, schema, root, problems))
      .filter((value): value is z.output<S> => value !== null);

  const planPath = join(root, "plan.yaml");
  const plan = existsSync(planPath) ? readFile(planPath, planFile, root, problems) : null;

  const library = all("library", libraryFile);
  const libraryIds = new Set<string>();
  for (const entry of library) {
    if (libraryIds.has(entry.id)) problems.push(`library: duplicate id ${entry.id}`);
    libraryIds.add(entry.id);
  }

  const pools = yamlFiles(join(root, "questions"))
    .map((path) => {
      const pool = readFile(path, questionPoolFile, root, problems);
      if (pool && pool.pool !== basename(path, ".yaml")) {
        problems.push(`questions/${basename(path)}: "pool" must match the file name`);
      }
      return pool;
    })
    .filter((pool) => pool !== null);

  return {
    bundle: {
      plan,
      blocks: all("blocks", blockFile),
      days: all("days", dayFile),
      cards: all("cards", cardFile),
      library,
      pools,
    },
    problems,
  };
}
