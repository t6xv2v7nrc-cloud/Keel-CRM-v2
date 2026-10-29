// Writing a row when the database may not have had every update yet. Ridwan runs each migration by hand, so the app
// can be ahead of the database: a write that names a column the database does not have yet is tried again without it,
// and the rest still saves.

type DbError = { message?: string; code?: string } | null;

/** The column PostgREST says is missing ("Could not find the 'bedrooms_needed' column of 'applicants' in the schema
 *  cache"), or null when the error is about something else. */
export const missingColumnOf = (e: DbError): string | null => /could not find the '([^']+)' column/i.exec(e?.message ?? '')?.[1] ?? null;

/** Write `row`; each time the database lacks a column, drop that column and try again. Gives the last result, and the
 *  columns that had to be left out. */
export async function writeDropping<R extends { error: DbError }>(
  row: Record<string, unknown>,
  write: (row: Record<string, unknown>) => PromiseLike<R>,
): Promise<R & { dropped: string[] }> {
  let rest = { ...row };
  const dropped: string[] = [];
  for (let i = 0; ; i++) {
    const res = await write(rest);
    const col = missingColumnOf(res.error);
    if (!col || !(col in rest) || i >= 12) return { ...res, dropped };
    dropped.push(col);
    rest = Object.fromEntries(Object.entries(rest).filter(([k]) => k !== col));
  }
}
