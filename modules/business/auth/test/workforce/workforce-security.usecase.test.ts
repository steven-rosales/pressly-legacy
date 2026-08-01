import { describe, expect, it, vi } from 'vitest';
import {
  makeListWorkforceMemberSessions,
  makeListWorkforceSecurityEvents,
  makeRevokeWorkforceMemberSessions,
} from '../../src/workforce/workforce-security.usecase.ts';
import type { WorkforceSecurityStore } from '../../src/workforce/workforce-security.port.ts';

const businessId = '00000000-0000-4000-8000-000000000100';
const membershipId = '00000000-0000-4000-8000-000000000101';
const actor = {
  identityId: '00000000-0000-4000-8000-000000000001',
  sessionId: '00000000-0000-4000-8000-000000000002',
};
const now = new Date('2026-08-01T16:00:00.000Z');

const makeStore = (): WorkforceSecurityStore => ({
  listMemberSessions: vi.fn(
    async () =>
      ({
        tag: 'ok',
        value: {
          status: 'found',
          sessions: [
            {
              id: actor.sessionId,
              issuedAt: new Date('2026-08-01T14:00:00.000Z'),
              lastUsedAt: new Date('2026-08-01T15:59:00.000Z'),
              expiresAt: new Date('2026-08-01T20:00:00.000Z'),
              revokedAt: null,
              current: true,
            },
          ],
        },
      }) as const,
  ),
  revokeMemberSessions: vi.fn(
    async () =>
      ({
        tag: 'ok',
        value: {
          status: 'replayed',
          value: { revokedCount: 2 },
        },
      }) as const,
  ),
  listSecurityEvents: vi.fn(
    async () =>
      ({
        tag: 'ok',
        value: {
          status: 'found',
          events: [
            {
              id: '00000000-0000-4000-8000-000000000201',
              eventType: 'auth.workforce_membership_suspended',
              resourceType: 'workforce_membership',
              actorDisplayName: 'Owner One',
              createdAt: new Date('2026-08-01T15:00:00.000Z'),
            },
          ],
          nextCursor: null,
        },
      }) as const,
  ),
});

describe('workforce security use cases', () => {
  it('maps member sessions without exposing credentials', async () => {
    const store = makeStore();
    const usecase = makeListWorkforceMemberSessions({
      store,
      clock: { now: () => now },
    });

    const actual = await usecase({ actor, businessId, membershipId });

    expect(actual).toEqual({
      tag: 'ok',
      value: {
        sessions: [
          {
            id: actor.sessionId,
            issuedAt: '2026-08-01T14:00:00.000Z',
            lastUsedAt: '2026-08-01T15:59:00.000Z',
            expiresAt: '2026-08-01T20:00:00.000Z',
            revokedAt: null,
            current: true,
          },
        ],
      },
    });
    expect(JSON.stringify(actual)).not.toMatch(/token|secret/i);
  });

  it('keeps session revocation replay-safe', async () => {
    const store = makeStore();
    const usecase = makeRevokeWorkforceMemberSessions({
      store,
      clock: { now: () => now },
    });

    const actual = await usecase({
      actor,
      businessId,
      membershipId,
      idempotencyKey: 'revoke-member-sessions-001',
    });

    expect(actual).toEqual({
      tag: 'ok',
      value: { revokedCount: 2, replayed: true },
    });
    expect(store.revokeMemberSessions).toHaveBeenCalledWith(
      expect.objectContaining({
        actor,
        businessId,
        membershipId,
        idempotencyKey: 'revoke-member-sessions-001',
        now,
      }),
    );
  });

  it('returns only the redacted audit projection', async () => {
    const store = makeStore();
    const usecase = makeListWorkforceSecurityEvents({
      store,
      clock: { now: () => now },
    });

    const actual = await usecase({ actor, businessId, limit: 25 });

    expect(actual).toEqual({
      tag: 'ok',
      value: {
        events: [
          {
            id: '00000000-0000-4000-8000-000000000201',
            eventType: 'auth.workforce_membership_suspended',
            resourceType: 'workforce_membership',
            actorDisplayName: 'Owner One',
            createdAt: '2026-08-01T15:00:00.000Z',
          },
        ],
        nextCursor: null,
      },
    });
    expect(JSON.stringify(actual)).not.toMatch(/metadata|resourceId|ipAddress/);
  });
});
