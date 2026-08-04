import { describe, expect, it, vi } from 'vitest';
import { type Database } from '@pressly/db/client';
import * as auth from '@pressly/db/schema/auth';
import { makeAppError } from '@pressly/errors/app-error';
import { recordAuthAuditEvent } from '../../../../../src/foundations/adapters/postgres/identity-store/auth-audit.repo.ts';
import {
  databaseFailure,
  runDatabaseOperation,
} from '../../../../../src/foundations/adapters/postgres/identity-store/database-result.adapter.ts';

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

describe('recordAuthAuditEvent', () => {
  it('inserts audit events with an empty metadata default', async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn(() => ({ values }));
    const db = { insert } as unknown as Database;

    await recordAuthAuditEvent(db, {
      principalIdentityId: '11111111-1111-4111-8111-111111111111',
      eventType: 'auth.login.succeeded',
      resourceType: 'auth_session',
      resourceId: 'session-1',
    });

    expect(insert).toHaveBeenCalledWith(auth.authAuditEvents);
    expect(values).toHaveBeenCalledWith({
      principalIdentityId: '11111111-1111-4111-8111-111111111111',
      eventType: 'auth.login.succeeded',
      resourceType: 'auth_session',
      resourceId: 'session-1',
      metadata: {},
    });
  });

  it('preserves provided audit metadata', async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn(() => ({ values }));
    const db = { insert } as unknown as Database;

    await recordAuthAuditEvent(db, {
      eventType: 'auth.logout',
      resourceType: 'auth_session',
      metadata: { reason: 'user_logout' },
    });

    expect(values).toHaveBeenCalledWith({
      eventType: 'auth.logout',
      resourceType: 'auth_session',
      metadata: { reason: 'user_logout' },
    });
  });
});
