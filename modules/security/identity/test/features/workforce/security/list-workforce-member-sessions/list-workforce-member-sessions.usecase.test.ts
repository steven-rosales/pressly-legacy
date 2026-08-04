import { describe, expect, it } from 'vitest';
import { makeListWorkforceMemberSessions } from '../../../../../src/features/workforce/security/list-workforce-member-sessions/list-workforce-member-sessions.usecase.ts';
import { makeWorkforceSecurityStoreFake } from '../../../../support/workforce-security-store.fake.ts';

const actor = {
  identityId: '00000000-0000-4000-8000-000000000001',
  sessionId: '00000000-0000-4000-8000-000000000002',
};

describe('list workforce member sessions', () => {
  it('maps member sessions without exposing credentials', async () => {
    const usecase = makeListWorkforceMemberSessions({
      store: makeWorkforceSecurityStoreFake(),
      clock: { now: () => new Date('2026-08-01T16:00:00.000Z') },
    });

    const actual = await usecase({
      actor,
      businessId: '00000000-0000-4000-8000-000000000100',
      membershipId: '00000000-0000-4000-8000-000000000101',
    });

    expect(actual).toMatchObject({
      tag: 'ok',
      value: {
        sessions: [
          {
            id: actor.sessionId,
            issuedAt: '2026-08-01T14:00:00.000Z',
            current: true,
          },
        ],
      },
    });
    expect(JSON.stringify(actual)).not.toMatch(/token|secret/i);
  });
});
