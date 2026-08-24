import type { PostgresDatabase } from '../src/client.ts';
import { createPostgresRuntime } from '../src/client.ts';
import { withPostgresAdvisoryTransactionLock } from '../src/advisory-lock.postgres.ts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const runtime = createPostgresRuntime({
  databaseUrl:
    process.env['PRESSLY_TEST_DATABASE_URL'] ??
    'postgres://pressly:pressly@localhost:55434/pressly_test',
  schema: {},
  maxConnections: 3,
});

beforeAll(runtime.check);
afterAll(runtime.close);

const deferred = () => {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
};

describe('PostgreSQL advisory transaction lock integration', () => {
  it('serializes concurrent work for the same semantic key', async () => {
    const key = `control:bootstrap-production:${process.pid}:${Date.now()}`;
    const events: string[] = [];
    const firstEntered = deferred();
    const releaseFirst = deferred();
    const secondTransactionEntered = deferred();

    const first = withPostgresAdvisoryTransactionLock(
      runtime.db,
      key,
      async () => {
        events.push('first:start');
        firstEntered.resolve();
        await releaseFirst.promise;
        events.push('first:end');
      },
    );
    await firstEntered.promise;

    const observedSecondDatabase = {
      transaction: <Value>(
        work: Parameters<PostgresDatabase['transaction']>[0],
        options?: Parameters<PostgresDatabase['transaction']>[1],
      ) =>
        runtime.db.transaction(async (transaction) => {
          secondTransactionEntered.resolve();
          return work(transaction) as Promise<Value>;
        }, options) as Promise<Value>,
    } satisfies Pick<PostgresDatabase, 'transaction'>;
    const second = withPostgresAdvisoryTransactionLock(
      observedSecondDatabase,
      key,
      async () => {
        events.push('second:start');
        events.push('second:end');
      },
    );

    await secondTransactionEntered.promise;
    expect(events).toEqual(['first:start']);

    releaseFirst.resolve();
    await Promise.all([first, second]);
    expect(events).toEqual([
      'first:start',
      'first:end',
      'second:start',
      'second:end',
    ]);
  });
});
