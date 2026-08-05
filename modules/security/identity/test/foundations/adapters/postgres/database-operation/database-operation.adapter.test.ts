import { describe, expect, it } from 'vitest';
import { makeAppError } from '@pressly/errors/app-error';
import {
  databaseFailure,
  runDatabaseOperation,
} from '../../../../../src/foundations/adapters/postgres/database-operation/database-operation.adapter.ts';

describe('database operations', () => {
  it('returns successful work directly', async () => {
    await expect(runDatabaseOperation(async () => 'stored')).resolves.toBe(
      'stored',
    );
  });

  it('wraps unknown failures as auth database errors', async () => {
    const cause = new Error('postgres failed');
    await expect(
      runDatabaseOperation(async () => {
        throw cause;
      }),
    ).rejects.toMatchObject({
      kind: 'DatabaseError',
      code: 'auth_database_failed',
      safeMessage: 'Authentication could not be completed.',
      status: 503,
      cause,
    });
  });

  it('preserves app errors thrown by database work', async () => {
    const appError = makeAppError({
      kind: 'InvariantViolationError',
      code: 'insert_returned_no_row',
      message: 'Insert returned no row.',
      status: 500,
    });
    await expect(
      runDatabaseOperation(async () => {
        throw appError;
      }),
    ).rejects.toBe(appError);
  });

  it('creates auth database failures with the shared error code', () => {
    expect(databaseFailure('db error')).toMatchObject({
      kind: 'DatabaseError',
      code: 'auth_database_failed',
      safeMessage: 'Authentication could not be completed.',
      status: 503,
    });
  });
});
