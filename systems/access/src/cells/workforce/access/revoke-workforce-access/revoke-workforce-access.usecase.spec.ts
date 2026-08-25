import * as result from '@pressly/cells/result';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, it, vi } from 'vitest';
import { revokeWorkforceAccessCellDeclaration } from './cell.ts';
import { makeRevokeWorkforceAccess } from './revoke-workforce-access.usecase.ts';
import type { RevokeWorkforceAccessStore } from './revoke-workforce-access.port.ts';

const now = new Date('2026-07-29T12:00:00.000Z');
const actor = { identityId: 'owner-id', sessionId: 'owner-session' };
const grant = {
  id: 'grant-id',
  businessId: 'business-id',
  membershipId: 'membership-id',
  identityId: 'operator-id',
  role: 'operator' as const,
  scope: { kind: 'location' as const, id: 'location-id' },
  state: 'active' as const,
  version: 1,
  startsAt: now,
  endsAt: null,
  effective: true,
};

describe('revoke workforce access', () => {
  proveOperation({
    operationId: 'access.revoke-workforce-access.v1',
    declaration: revokeWorkforceAccessCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'returns the atomic session-revocation count after access reduction',
        proves: ['contract', 'executor-success'],
        run: async () => {
          const input = {
            actor,
            businessId: 'business-id',
            grantId: 'grant-id',
            expectedVersion: 1,
            reason: 'location access removed',
            idempotencyKey: 'revoke-grant-1',
          };
          expect(
            revokeWorkforceAccessCellDeclaration.contract.input.decode(input)
              .kind,
          ).toBe('valid');
          const store: RevokeWorkforceAccessStore = {
            revoke: vi.fn(async () => ({
              status: 'applied' as const,
              value: {
                grant: {
                  ...grant,
                  state: 'revoked' as const,
                  version: 2,
                  effective: false,
                },
                revokedSessionCount: 2,
              },
            })),
          };
          const revoke = makeRevokeWorkforceAccess({
            store,
            clock: { now: () => now },
          });

          const response = await revoke(input);

          expect(response).toEqual(
            result.ok({
              grant: {
                ...grant,
                state: 'revoked',
                version: 2,
                effective: false,
              },
              revokedSessionCount: 2,
            }),
          );
        },
      },
    ],
  });

  it('returns validation without touching the revoke store', async () => {
    const store: RevokeWorkforceAccessStore = { revoke: vi.fn() };
    const revoke = makeRevokeWorkforceAccess({
      store,
      clock: { now: () => now },
    });

    await expect(
      revoke({
        actor,
        businessId: 'business-id',
        grantId: ' ',
        expectedVersion: 1,
        idempotencyKey: 'revoke-access-invalid',
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { kind: 'validation' },
    });
    expect(store.revoke).not.toHaveBeenCalled();
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
  ])('returns a typed $name store rejection', async (testCase) => {
    const store: RevokeWorkforceAccessStore = {
      revoke: vi.fn(async () => ({
        status: 'rejected' as const,
        reason: testCase.reason,
      })),
    };
    const revoke = makeRevokeWorkforceAccess({
      store,
      clock: { now: () => now },
    });

    await expect(
      revoke({
        actor,
        businessId: 'business-id',
        grantId: 'grant-id',
        expectedVersion: 1,
        idempotencyKey: `revoke-access-${testCase.name}`,
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { kind: testCase.expectedKind },
    });
    expect(store.revoke).toHaveBeenCalledOnce();
  });
});
