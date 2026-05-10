import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.ts';

export type Database = PostgresJsDatabase<typeof schema>;

export type DatabaseRuntime = Readonly<{
  db: Database;
  close: () => Promise<void>;
}>;

export const createDatabaseRuntime = (databaseUrl: string): DatabaseRuntime => {
  const client = postgres(databaseUrl, { max: 10, prepare: false });

  const db = drizzle(client, { schema });

  return { db, close: async () => await client.end() };
};
