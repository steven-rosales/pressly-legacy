/**
 * Migrations work after generating a migraion file.
 */

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDirectory = join(packageRoot, 'migrations');

const migrationsTableSql = `
  create table if not exists schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  );
`;

const getAppliedMigrationNames = async (
  client: postgres.Sql,
): Promise<ReadonlySet<string>> => {
  const rows = await client<{ name: string }[]>`
    select name from schema_migrations
  `;

  return new Set(rows.map((row) => row.name));
};

export const migrateDatabase = async (databaseUrl: string): Promise<void> => {
  const client = postgres(databaseUrl, { max: 1, prepare: false });

  try {
    await client.unsafe(migrationsTableSql);

    const applied = await getAppliedMigrationNames(client);

    const migrationNames = (
      await readdir(migrationsDirectory, { withFileTypes: true })
    )
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    for (const migrationName of migrationNames) {
      if (applied.has(migrationName)) continue;

      const migrationSql = await readFile(
        join(migrationsDirectory, migrationName, 'migration.sql'),
        'utf-8',
      );

      await client.begin(async (tx) => {
        await tx.unsafe(migrationSql).simple();
        await tx`
          insert into schema_migrations (name)
          values (${migrationName})
        `;
      });

      console.log(`applied migration: ${migrationName}`);
    }
  } finally {
    await client.end();
  }
};
