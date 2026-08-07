import { vi } from 'vitest';
import type { ListWorkforceMemberSessionsStore } from '../../src/features/workforce/security/list-workforce-member-sessions/list-workforce-member-sessions.port.ts';
import type { ListWorkforceSecurityEventsStore } from '../../src/features/workforce/security/list-workforce-security-events/list-workforce-security-events.port.ts';
import type { RevokeWorkforceMemberSessionsStore } from '../../src/features/workforce/security/revoke-workforce-member-sessions/revoke-workforce-member-sessions.port.ts';

type WorkforceSecurityStoreFake = ListWorkforceMemberSessionsStore &
  ListWorkforceSecurityEventsStore &
  RevokeWorkforceMemberSessionsStore;

export const makeWorkforceSecurityStoreFake =
  (): WorkforceSecurityStoreFake => ({
    listMemberSessions: vi.fn(
      async () =>
        ({
          status: 'found',
          sessions: [
            {
              id: '00000000-0000-4000-8000-000000000002',
              issuedAt: new Date('2026-08-01T14:00:00.000Z'),
              lastUsedAt: new Date('2026-08-01T15:59:00.000Z'),
              expiresAt: new Date('2026-08-01T20:00:00.000Z'),
              revokedAt: null,
              current: true,
            },
          ],
        }) as const,
    ),
    revokeMemberSessions: vi.fn(
      async () =>
        ({
          status: 'replayed',
          value: { revokedCount: 2 },
        }) as const,
    ),
    listSecurityEvents: vi.fn(
      async () =>
        ({
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
        }) as const,
    ),
  });
