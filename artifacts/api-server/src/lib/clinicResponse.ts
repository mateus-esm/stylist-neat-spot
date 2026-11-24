import { getTableColumns, type Table } from "drizzle-orm";

/** Present a Drizzle row using the database column names the clinic UI expects. */
export function rowToSnake(row: Record<string, unknown>, table: Table) {
  const columns = getTableColumns(table);
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [columns[key]?.name ?? key, value]),
  );
}
