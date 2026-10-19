import { type PersonRef } from "@portal/contracts";
import { type Tx } from "../prisma/prisma.service.js";

/**
 * Who wrote a manager record (check-in, unlock, gate, final review). Engineers can't read other users'
 * rows, so names come from `app.author_names()`, which returns the name only, and only for authors of
 * records the caller may read.
 */
export async function authorNames(tx: Tx, ids: Iterable<string>): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await tx.$queryRaw<{ id: string; name: string }[]>`
    SELECT id, name FROM app.author_names(${unique}::uuid[])`;
  return new Map(rows.map((row) => [row.id, row.name]));
}

export function personOf(names: ReadonlyMap<string, string>, id: string): PersonRef {
  return { id, name: names.get(id) ?? "" };
}
