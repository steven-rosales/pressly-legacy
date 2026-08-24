import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, it, vi } from 'vitest';
import { revokeWorkforceMemberSessionsCellDeclaration } from './cell.ts';
import { makeRevokeWorkforceMemberSessions } from './revoke-workforce-member-sessions.usecase.ts';
import { makeWorkforceSecurityStoreFake } from '../../../../testing/workforce-security-store.spec-support.ts';

const actor = {
  identityId: '00000000-0000-4000-8000-000000000001',
  sessionId: '00000000-0000-4000-8000-000000000002',
};
const now = new Date('2026-08-01T16:00:00.000Z');

describe('revoke workforce member sessions', () => {
  proveOperation({
    operationId: 'access.revoke-workforce-member-sessions.v1',
    declaration: revokeWorkforceMemberSessionsCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'keeps session revocation replay-safe',
        proves: ['contract', 'executor-success'],
        run: async () => {
          const input = {
            actor,
            businessId: '00000000-0000-4000-8000-000000000100',
            membershipId: '00000000-0000-4000-8000-000000000101',
            idempotencyKey: 'revoke-member-sessions-001',
          };
          expect(
            revokeWorkforceMemberSessionsCellDeclaration.contract.input.decode(
              input,
            ).kind,
          ).toBe('valid');
          const store = makeWorkforceSecurityStoreFake();
          const usecase = makeRevokeWorkforceMemberSessions({
            store,
            clock: { now: () => now },
          });

          const actual = await usecase(input);

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
        },
      },
    ],
  });

  it('returns validation without revoking workforce sessions', async () => {
    const store = {
      ...makeWorkforceSecurityStoreFake(),
      revokeMemberSessions: vi.fn(),
    };
    const usecase = makeRevokeWorkforceMemberSessions({
      store,
      clock: { now: () => now },
    });

    await expect(
      usecase({
        actor,
        businessId: 'business-id',
        membershipId: ' ',
        idempotencyKey: 'revoke-invalid',
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { kind: 'validation' },
    });
    expect(store.revokeMemberSessions).not.toHaveBeenCalled();
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
  ])('returns a typed $name session-revocation rejection', async (testCase) => {
    const store = {
      ...makeWorkforceSecurityStoreFake(),
      revokeMemberSessions: vi.fn(async () => ({
        status: 'rejected' as const,
        reason: testCase.reason,
      })),
    };
    const usecase = makeRevokeWorkforceMemberSessions({
      store,
      clock: { now: () => now },
    });

    await expect(
      usecase({
        actor,
        businessId: 'business-id',
        membershipId: 'membership-id',
        idempotencyKey: `revoke-${testCase.name}`,
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { kind: testCase.expectedKind },
    });
    expect(store.revokeMemberSessions).toHaveBeenCalledOnce();
  });
});
