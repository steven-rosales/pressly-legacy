import { result } from '@pressly/kernel';
import { describe, expect, it, vi } from 'vitest';
import { auth, type Database } from '@pressly/db';
import { makeAppError } from '@pressly/errors';
import { recordAuthAuditEvent } from '../../src/persistence/auth-audit.ts';
import {
  databaseFailure,
  toDatabaseResult,
} from '../../src/persistence/database-result.ts';

describe('database results', () => {
  it('returns successful work as an ok result', async () => {
    await expect(toDatabaseResult(async () => 'stored')).resolves.toEqual({
      tag: 'ok',
      value: 'stored',
    });
  });

  it('wraps unknown failures as auth database errors', async () => {
    const cause = new Error('postgres failed');
    const actual = await toDatabaseResult(async () => {
      throw cause;
    });

    expect(actual).toEqual({
      tag: 'err',
      error: expect.objectContaining({
        kind: 'DatabaseError',
        code: 'auth_database_failed',
        safeMessage: 'Authentication could not be completed.',
        status: 500,
      }),
    });
    if (result.isErr(actual)) expect(actual.error.cause).toBe(cause);
  });

  it('preserves app errors thrown by database work', async () => {
    const appError = makeAppError({
      kind: 'InvariantViolationError',
      code: 'insert_returned_no_row',
      message: 'Insert returned no row.',
      status: 500,
    });
    const actual = await toDatabaseResult(async () => {
      throw appError;
    });

    expect(actual).toEqual({ tag: 'err', error: appError });
  });

  it('creates auth database failures with the shared error code', () => {
    expect(databaseFailure('db error')).toMatchObject({
      kind: 'DatabaseError',
      code: 'auth_database_failed',
      safeMessage: 'Authentication could not be completed.',
      status: 500,
    });
  });
});

describe('recordAuthAuditEvent', () => {
  it('inserts audit events with an empty metadata default', async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn(() => ({ values }));
    const db = { insert } as unknown as Database;

    const actual = await recordAuthAuditEvent(db, {
      principalIdentityId: '11111111-1111-4111-8111-111111111111',
      eventType: 'auth.login.succeeded',
      resourceType: 'auth_session',
      resourceId: 'session-1',
    });

    expect(actual).toEqual({ tag: 'ok', value: undefined });
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

    const actual = await recordAuthAuditEvent(db, {
      eventType: 'auth.logout',
      resourceType: 'auth_session',
      metadata: { reason: 'user_logout' },
    });

    expect(result.isOk(actual)).toBe(true);
    expect(values).toHaveBeenCalledWith({
      eventType: 'auth.logout',
      resourceType: 'auth_session',
      metadata: { reason: 'user_logout' },
    });
  });
});
