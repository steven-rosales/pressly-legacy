import { type PostgresDatabase } from '@pressly/postgres/client';
import { describe, expect, it, vi } from 'vitest';
import { accessTestSchema as auth } from '../../testing/schema.ts';
import { recordAuthAuditEvent } from './auth-audit.repo.ts';

describe('recordAuthAuditEvent', () => {
  it('inserts audit events with an empty metadata default', async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn(() => ({ values }));
    const db = { insert } as unknown as PostgresDatabase;

    await recordAuthAuditEvent(db, auth, {
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
    const db = { insert } as unknown as PostgresDatabase;

    await recordAuthAuditEvent(db, auth, {
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
