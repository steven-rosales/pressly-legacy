import { validationError } from '@pressly/errors/factories';
import { sql } from 'drizzle-orm';
import type { DatabaseExecutor } from './client.ts';

const safeIdentifierPattern = /^[a-z][a-z0-9_]*$/;

export const truncateTestTables = async (
  db: DatabaseExecutor,
  tableNames: readonly string[],
): Promise<void> => {
  if (tableNames.length === 0)
    throw validationError({
      code: 'test_table_names_empty',
      message: 'At least one test table name is required.',
    });

  for (const tableName of tableNames) {
    if (!safeIdentifierPattern.test(tableName))
      throw validationError({
        code: 'unsafe_test_table_name',
        message: `Unsafe test table name: ${tableName}.`,
        details: { tableName },
      });
  }

  const identifiers = tableNames.map((tableName) => sql.identifier(tableName));

  await db.execute(
    sql`truncate table ${sql.join(identifiers, sql`, `)} restart identity cascade`,
  );
};
