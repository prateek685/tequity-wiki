import { createHash } from "node:crypto";
import { type ContentBundle, type DayFile, type QuestionPoolFile } from "@portal/content";
import type pg from "pg";

/**
 * `pnpm content:import` core (docs/PORTAL_PLAN.md §6). Runs as the owner inside the caller's
 * transaction. Everything imported is live. Re-runnable: rows are compared by content hash and a
 * changed row simply replaces the old one; a changed question also gets version + 1 (quiz items keep
 * their snapshot). Questions removed from the files are deleted, or retired (kept, never picked for a
 * new quiz) when an engineer has already been asked them.
 */

/** JSON with object keys sorted, so the hash doesn't depend on key order. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function contentHash(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export interface ExistingQuestion {
  id: string;
  contentHash: string;
  version: number;
  retired: boolean;
  /** Asked in at least one attempt (can't be deleted). */
  used: boolean;
}

export interface IncomingQuestion {
  id: string;
  pool: string;
  type: string;
  data: unknown;
  contentHash: string;
}

export interface QuestionPlan {
  insert: IncomingQuestion[];
  /** Changed: new version (and no longer retired if it was). */
  update: (IncomingQuestion & { version: number })[];
  unchanged: number;
  /** Unchanged but retired earlier and now back in the files. */
  restore: string[];
  delete: string[];
  retire: string[];
}

/** Decide what happens to each question. Pure. */
export function planQuestions(
  existing: readonly ExistingQuestion[],
  incoming: readonly IncomingQuestion[],
): QuestionPlan {
  const plan: QuestionPlan = { insert: [], update: [], unchanged: 0, restore: [], delete: [], retire: [] };
  const byId = new Map(existing.map((q) => [q.id, q]));
  const incomingIds = new Set(incoming.map((q) => q.id));
  for (const question of incoming) {
    const current = byId.get(question.id);
    if (!current) plan.insert.push(question);
    else if (current.contentHash !== question.contentHash)
      plan.update.push({ ...question, version: current.version + 1 });
    else {
      plan.unchanged++;
      if (current.retired) plan.restore.push(question.id);
    }
  }
  for (const question of existing) {
    if (incomingIds.has(question.id)) continue;
    if (!question.used) plan.delete.push(question.id);
    else if (!question.retired) plan.retire.push(question.id);
  }
  return plan;
}

export function incomingQuestions(pools: readonly QuestionPoolFile[]): IncomingQuestion[] {
  return pools.flatMap((pool) =>
    pool.questions.map((question) => ({
      id: question.id,
      pool: pool.pool,
      type: question.type,
      data: question,
      contentHash: contentHash({ pool: pool.pool, question }),
    })),
  );
}

export interface ImportSummary {
  blocks: number;
  days: { added: number; changed: number; unchanged: number; removed: number };
  cards: number;
  library: number;
  questions: { added: number; changed: number; unchanged: number; deleted: number; retired: number };
}

const json = (value: unknown) => JSON.stringify(value);

/**
 * How a day file is stored. Key columns, `data` (what engineers see: story date, minutes, intro,
 * lessons) and `writeScoring` (the AI scoring guide by lesson id; server only, never in `data`). Pure.
 */
export function dayRow(file: DayFile) {
  const { day, block, title, type, storyDate, minutes, intro, lessons, scoring } = file;
  return {
    day,
    block,
    title,
    type,
    data: { storyDate, minutes, intro, lessons },
    writeScoring: scoring ?? null,
    hash: contentHash(file),
  };
}

/** Upsert keyed rows; a row is rewritten only when its content hash changed. */
async function syncSimple(
  db: pg.ClientBase,
  table: "content_blocks" | "content_cards",
  key: "number" | "id",
  rows: { key: string | number; data: unknown; hash: string }[],
): Promise<void> {
  for (const row of rows) {
    await db.query(
      `INSERT INTO ${table} (${key}, data, content_hash) VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (${key}) DO UPDATE SET data = excluded.data, content_hash = excluded.content_hash,
         imported_at = now()
       WHERE ${table}.content_hash <> excluded.content_hash`,
      [row.key, json(row.data), row.hash],
    );
  }
}

async function importDays(db: pg.ClientBase, bundle: ContentBundle): Promise<ImportSummary["days"]> {
  const summary = { added: 0, changed: 0, unchanged: 0, removed: 0 };
  const { rows } = await db.query<{ day: number; content_hash: string }>(
    "SELECT day, content_hash FROM content_days",
  );
  const existing = new Map(rows.map((row) => [row.day, row.content_hash]));
  for (const file of bundle.days) {
    const row = dayRow(file);
    const current = existing.get(row.day);
    if (current === row.hash) {
      summary.unchanged++;
      continue;
    }
    if (current === undefined) summary.added++;
    else summary.changed++;
    await db.query(
      `INSERT INTO content_days (day, block_number, title, type, data, write_scoring, content_hash)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
       ON CONFLICT (day) DO UPDATE SET block_number = excluded.block_number, title = excluded.title,
         type = excluded.type, data = excluded.data, write_scoring = excluded.write_scoring,
         content_hash = excluded.content_hash, imported_at = now()`,
      [
        row.day,
        row.block,
        row.title,
        row.type,
        json(row.data),
        row.writeScoring ? json(row.writeScoring) : null,
        row.hash,
      ],
    );
  }
  const keep = bundle.days.map((d) => d.day);
  summary.removed =
    (await db.query("DELETE FROM content_days WHERE NOT (day = ANY($1::int[]))", [keep])).rowCount ?? 0;
  return summary;
}

async function importQuestions(
  db: pg.ClientBase,
  bundle: ContentBundle,
): Promise<ImportSummary["questions"]> {
  const { rows } = await db.query<{
    id: string;
    content_hash: string;
    version: number;
    retired: boolean;
    used: boolean;
  }>(
    `SELECT q.id, q.content_hash, q.version, q.retired,
            EXISTS (SELECT 1 FROM quiz_items i WHERE i.question_id = q.id) AS used
       FROM questions q`,
  );
  const plan = planQuestions(
    rows.map((r) => ({
      id: r.id,
      contentHash: r.content_hash,
      version: r.version,
      retired: r.retired,
      used: r.used,
    })),
    incomingQuestions(bundle.pools),
  );
  for (const q of plan.insert) {
    await db.query(
      `INSERT INTO questions (id, pool, type, data, content_hash) VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [q.id, q.pool, q.type, json(q.data), q.contentHash],
    );
  }
  for (const q of plan.update) {
    await db.query(
      `UPDATE questions SET pool = $2, type = $3, data = $4::jsonb, content_hash = $5, version = $6,
         retired = false, imported_at = now()
       WHERE id = $1`,
      [q.id, q.pool, q.type, json(q.data), q.contentHash, q.version],
    );
  }
  if (plan.delete.length > 0)
    await db.query("DELETE FROM questions WHERE id = ANY($1::text[])", [plan.delete]);
  if (plan.retire.length > 0)
    await db.query("UPDATE questions SET retired = true WHERE id = ANY($1::text[])", [plan.retire]);
  if (plan.restore.length > 0)
    await db.query("UPDATE questions SET retired = false WHERE id = ANY($1::text[])", [plan.restore]);
  return {
    added: plan.insert.length,
    changed: plan.update.length,
    unchanged: plan.unchanged,
    deleted: plan.delete.length,
    retired: plan.retire.length,
  };
}

/** Write a checked bundle to the database. The caller owns the transaction (BEGIN/COMMIT). */
export async function importContent(db: pg.ClientBase, bundle: ContentBundle): Promise<ImportSummary> {
  if (bundle.plan) {
    await db.query(
      `INSERT INTO content_plan (id, data, content_hash) VALUES (1, $1::jsonb, $2)
       ON CONFLICT (id) DO UPDATE SET data = excluded.data, content_hash = excluded.content_hash, imported_at = now()
       WHERE content_plan.content_hash <> excluded.content_hash`,
      [json(bundle.plan), contentHash(bundle.plan)],
    );
  }

  await syncSimple(
    db,
    "content_blocks",
    "number",
    bundle.blocks.map((block) => ({ key: block.number, data: block, hash: contentHash(block) })),
  );

  const cards = bundle.cards.map(({ prompt, ...card }) => ({ card, prompt }));
  await syncSimple(
    db,
    "content_cards",
    "id",
    cards.map(({ card, prompt }) => ({ key: card.id, data: card, hash: contentHash({ card, prompt }) })),
  );
  for (const { card, prompt } of cards) {
    await db.query(
      `INSERT INTO content_card_prompts (card_id, prompt) VALUES ($1, $2)
       ON CONFLICT (card_id) DO UPDATE SET prompt = excluded.prompt`,
      [card.id, prompt],
    );
  }
  await db.query("DELETE FROM content_cards WHERE NOT (id = ANY($1::text[]))", [cards.map((c) => c.card.id)]);

  for (const entry of bundle.library) {
    const { kind } = entry;
    await db.query(
      `INSERT INTO content_library (kind, id, data, content_hash) VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (kind, id) DO UPDATE SET data = excluded.data, content_hash = excluded.content_hash,
         imported_at = now()
       WHERE content_library.content_hash <> excluded.content_hash`,
      [kind, entry.id, json(entry), contentHash(entry)],
    );
  }
  await db.query("DELETE FROM content_library WHERE NOT ((kind || ':' || id) = ANY($1::text[]))", [
    bundle.library.map((entry) => `${entry.kind}:${entry.id}`),
  ]);

  const days = await importDays(db, bundle);
  // Blocks last: days that pointed at a removed block are gone by now.
  await db.query("DELETE FROM content_blocks WHERE NOT (number = ANY($1::int[]))", [
    bundle.blocks.map((block) => block.number),
  ]);
  const questions = await importQuestions(db, bundle);

  return {
    blocks: bundle.blocks.length,
    days,
    cards: cards.length,
    library: bundle.library.length,
    questions,
  };
}
