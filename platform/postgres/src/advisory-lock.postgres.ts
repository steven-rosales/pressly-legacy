import type { PostgresDatabase } from './client.ts';
import { sql } from './query.ts';

export const withPostgresAdvisoryTransactionLock = <Value>(
  database: Pick<PostgresDatabase, 'transaction'>,
  key: string,
  work: () => Promise<Value>,
): Promise<Value> =>
  database.transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
    );
    return work();
  });
