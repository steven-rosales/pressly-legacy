import { sql } from 'drizzle-orm';
import type { DatabaseExecutor } from './client.ts';

const safeIdentifierPattern = /^[a-z][a-z0-9_]*$/;

export const truncateTestTables = async (
  db: DatabaseExecutor,
  tableNames: readonly string[],
): Promise<void> => {
  if (tableNames.length === 0)
    throw new TypeError('At least one test table name is required.');

  for (const tableName of tableNames) {
    if (!safeIdentifierPattern.test(tableName))
      throw new TypeError(`Unsafe test table name: ${tableName}.`);
  }

  const identifiers = tableNames.map((tableName) => sql.identifier(tableName));

  await db.execute(
    sql`truncate table ${sql.join(identifiers, sql`, `)} restart identity cascade`,
  );
};
