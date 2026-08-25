import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

export type PostgresSchema = Record<string, unknown>;

type SharedPostgresOperations = Pick<
  PostgresJsDatabase,
  'delete' | 'execute' | 'insert' | 'select' | 'selectDistinct' | 'update'
>;

export type PostgresTransaction = Pick<
  SharedPostgresOperations,
  keyof SharedPostgresOperations
>;

export type PostgresExecutor = Pick<
  SharedPostgresOperations,
  keyof SharedPostgresOperations
>;

export type PostgresTransactionOptions = NonNullable<
  Parameters<PostgresJsDatabase['transaction']>[1]
>;

export type PostgresDatabase = SharedPostgresOperations &
  Readonly<{
    transaction: <Value>(
      work: (transaction: PostgresTransaction) => Promise<Value>,
      options?: PostgresTransactionOptions,
    ) => Promise<Value>;
  }>;

export type TypedPostgresDatabase<Schema extends PostgresSchema> =
  PostgresJsDatabase<Schema>;

export type TypedPostgresTransaction<Schema extends PostgresSchema> =
  Parameters<Parameters<TypedPostgresDatabase<Schema>['transaction']>[0]>[0];

export type PostgresRuntime<Schema extends PostgresSchema> = Readonly<{
  db: TypedPostgresDatabase<Schema>;
  check: () => Promise<void>;
  listen: (
    channel: string,
    onNotification: (payload: string) => void,
    onListen?: () => void,
  ) => Promise<() => Promise<void>>;
  close: () => Promise<void>;
}>;

export type PostgresRuntimeOptions<Schema extends PostgresSchema> = Readonly<{
  databaseUrl: string;
  schema: Schema;
  maxConnections?: number;
  connectTimeoutSeconds?: number;
  idleTimeoutSeconds?: number;
  maxLifetimeSeconds?: number;
}>;

export const createPostgresRuntime = <Schema extends PostgresSchema>(
  options: PostgresRuntimeOptions<Schema>,
): PostgresRuntime<Schema> => {
  const client = postgres(options.databaseUrl, {
    max: options.maxConnections ?? 10,
    connect_timeout: options.connectTimeoutSeconds ?? 5,
    idle_timeout: options.idleTimeoutSeconds ?? 30,
    max_lifetime: options.maxLifetimeSeconds ?? 60 * 30,
    prepare: false,
  });

  const db = drizzle(client, { schema: options.schema });

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
