import type { PostgresDatabase, PostgresTransaction } from '../src/client.ts';
import { withPostgresAdvisoryTransactionLock } from '../src/advisory-lock.postgres.ts';
import { describe, expect, it, vi } from 'vitest';

describe('PostgreSQL advisory transaction lock', () => {
  it('holds work after lock acquisition and inside the transaction boundary', async () => {
    const events: string[] = [];
    const execute = vi.fn(async () => {
      events.push('lock');
      return [];
    });
    const database = {
      transaction: async <Value>(
        work: (transaction: PostgresTransaction) => Promise<Value>,
      ) => {
        events.push('transaction:start');
        try {
          return await work({ execute } as unknown as PostgresTransaction);
        } finally {
          events.push('transaction:end');
        }
      },
    } satisfies Pick<PostgresDatabase, 'transaction'>;

    await expect(
      withPostgresAdvisoryTransactionLock(
        database,
        'control:bootstrap-production',
        async () => {
          events.push('work');
          return 'complete';
        },
      ),
    ).resolves.toBe('complete');

    expect(execute).toHaveBeenCalledOnce();
    expect(events).toEqual([
      'transaction:start',
      'lock',
      'work',
      'transaction:end',
    ]);
  });
});
