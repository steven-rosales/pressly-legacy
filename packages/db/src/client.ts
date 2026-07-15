import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.ts';

export type Database = PostgresJsDatabase<typeof schema>;

export type DatabaseRuntime = Readonly<{
  db: Database;
  check: () => Promise<void>;
  listen: (
    channel: string,
    onNotification: (payload: string) => void,
    onListen?: () => void,
  ) => Promise<() => Promise<void>>;
  close: () => Promise<void>;
}>;

export type DatabaseRuntimeOptions = Readonly<{
  databaseUrl: string;
  maxConnections?: number;
  connectTimeoutSeconds?: number;
  idleTimeoutSeconds?: number;
  maxLifetimeSeconds?: number;
}>;

export type DatabaseTransaction = Parameters<
  Parameters<Database['transaction']>[0]
>[0];

export type DatabaseExecutor = Database | DatabaseTransaction;

export const createDatabaseRuntime = (
  options: DatabaseRuntimeOptions,
): DatabaseRuntime => {
  const client = postgres(options.databaseUrl, {
    max: options.maxConnections ?? 10,
    connect_timeout: options.connectTimeoutSeconds ?? 5,
    idle_timeout: options.idleTimeoutSeconds ?? 30,
    max_lifetime: options.maxLifetimeSeconds ?? 60 * 30,
    prepare: false,
  });

  const db = drizzle(client, { schema });

  return {
    db,

    check: async (): Promise<void> => {
      await db.execute(sql`select 1`);
    },

    listen: async (channel, onNotification, onListen) => {
      const listener = await client.listen(channel, onNotification, onListen);
      return () => listener.unlisten();
    },

    close: async (): Promise<void> => {
      await client.end();
    },
  };
};
