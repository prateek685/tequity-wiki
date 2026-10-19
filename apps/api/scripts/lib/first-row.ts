import type pg from "pg";

/** The first row of a query result, or a clear error when the query returned nothing. */
export function firstRow<T extends pg.QueryResultRow>(result: pg.QueryResult<T>, what: string): T {
  const row = result.rows[0];
  if (!row) throw new Error(`${what}: query returned no row`);
  return row;
}
