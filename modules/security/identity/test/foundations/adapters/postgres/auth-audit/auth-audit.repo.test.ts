import { type Database } from '@pressly/db/client';
import * as auth from '@pressly/db/schema/auth';
import { describe, expect, it, vi } from 'vitest';
import { recordAuthAuditEvent } from '../../../../../src/foundations/adapters/postgres/auth-audit/auth-audit.repo.ts';

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
