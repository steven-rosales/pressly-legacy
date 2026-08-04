import { describe, expect, it } from 'vitest';
import { makeListWorkforceSecurityEvents } from '../../../../../src/features/workforce/security/list-workforce-security-events/list-workforce-security-events.usecase.ts';
import { makeWorkforceSecurityStoreFake } from '../../../../support/workforce-security-store.fake.ts';

describe('list workforce security events', () => {
  it('returns only the redacted audit projection', async () => {
    const usecase = makeListWorkforceSecurityEvents({
      store: makeWorkforceSecurityStoreFake(),
      clock: { now: () => new Date('2026-08-01T16:00:00.000Z') },
    });

    const actual = await usecase({
      actor: {
        identityId: '00000000-0000-4000-8000-000000000001',
        sessionId: '00000000-0000-4000-8000-000000000002',
      },
      businessId: '00000000-0000-4000-8000-000000000100',
      limit: 25,
    });

    expect(actual).toMatchObject({
      tag: 'ok',
      value: {
        events: [
          {
            id: '00000000-0000-4000-8000-000000000201',
            createdAt: '2026-08-01T15:00:00.000Z',
          },
        ],
        nextCursor: null,
      },
    });
    expect(JSON.stringify(actual)).not.toMatch(/metadata|resourceId|ipAddress/);
  });
});
