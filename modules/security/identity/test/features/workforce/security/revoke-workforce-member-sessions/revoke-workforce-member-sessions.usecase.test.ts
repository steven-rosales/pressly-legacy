import { describe, expect, it } from 'vitest';
import { makeRevokeWorkforceMemberSessions } from '../../../../../src/features/workforce/security/revoke-workforce-member-sessions/revoke-workforce-member-sessions.usecase.ts';
import { makeWorkforceSecurityStoreFake } from '../../../../support/workforce-security-store.fake.ts';

const actor = {
  identityId: '00000000-0000-4000-8000-000000000001',
  sessionId: '00000000-0000-4000-8000-000000000002',
};
const now = new Date('2026-08-01T16:00:00.000Z');

describe('revoke workforce member sessions', () => {
  it('keeps session revocation replay-safe', async () => {
    const store = makeWorkforceSecurityStoreFake();
    const usecase = makeRevokeWorkforceMemberSessions({
      store,
      clock: { now: () => now },
    });

    const actual = await usecase({
      actor,
      businessId: '00000000-0000-4000-8000-000000000100',
      membershipId: '00000000-0000-4000-8000-000000000101',
      idempotencyKey: 'revoke-member-sessions-001',
    });

    expect(actual).toEqual({
      tag: 'ok',
      value: { revokedCount: 2, replayed: true },
    });
    expect(store.revokeMemberSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        actor,
        idempotencyKey: 'revoke-member-sessions-001',
        now,
      }),
    );
  });
});
