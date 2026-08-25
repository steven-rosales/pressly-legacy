import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, it, vi } from 'vitest';
import { listWorkforceMemberSessionsCellDeclaration } from './cell.ts';
import { makeListWorkforceMemberSessions } from './list-workforce-member-sessions.usecase.ts';
import { makeWorkforceSecurityStoreFake } from '../../../../testing/workforce-security-store.spec-support.ts';

const actor = {
  identityId: '00000000-0000-4000-8000-000000000001',
  sessionId: '00000000-0000-4000-8000-000000000002',
};

proveOperation({
  operationId: 'access.list-workforce-member-sessions.v1',
  declaration: listWorkforceMemberSessionsCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'maps member sessions without exposing credentials',
      proves: ['contract', 'executor-success'],
      run: async () => {
        expect(
          listWorkforceMemberSessionsCellDeclaration.contract.input.decode({
            actor,
            businessId: '00000000-0000-4000-8000-000000000100',
            membershipId: '00000000-0000-4000-8000-000000000101',
          }).kind,
        ).toBe('valid');
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
      },
    },
  ],
});

it('returns validation without reading workforce sessions', async () => {
  const store = {
    ...makeWorkforceSecurityStoreFake(),
    listMemberSessions: vi.fn(),
  };
  const usecase = makeListWorkforceMemberSessions({
    store,
    clock: { now: () => new Date('2026-08-01T16:00:00.000Z') },
  });

  await expect(
    usecase({ actor, businessId: 'business-id', membershipId: ' ' }),
  ).resolves.toMatchObject({
    tag: 'err',
    error: { kind: 'validation' },
  });
  expect(store.listMemberSessions).not.toHaveBeenCalled();
});

it.each([
  {
    name: 'authentication',
    reason: 'authentication_required' as const,
    expectedKind: 'authentication' as const,
  },
  {
    name: 'conflict',
    reason: 'idempotency_conflict' as const,
    expectedKind: 'conflict' as const,
  },
  {
    name: 'not found',
    reason: 'not_found' as const,
    expectedKind: 'not_found' as const,
  },
  {
    name: 'permission denial',
    reason: 'outside_business' as const,
    expectedKind: 'permission' as const,
  },
])('returns a typed $name session-list rejection', async (testCase) => {
  const store = {
    ...makeWorkforceSecurityStoreFake(),
    listMemberSessions: vi.fn(async () => ({
      status: 'rejected' as const,
      reason: testCase.reason,
    })),
  };
  const usecase = makeListWorkforceMemberSessions({
    store,
    clock: { now: () => new Date('2026-08-01T16:00:00.000Z') },
  });

  await expect(
    usecase({
      actor,
      businessId: 'business-id',
      membershipId: 'membership-id',
    }),
  ).resolves.toMatchObject({
    tag: 'err',
    error: { kind: testCase.expectedKind },
  });
  expect(store.listMemberSessions).toHaveBeenCalledOnce();
});
