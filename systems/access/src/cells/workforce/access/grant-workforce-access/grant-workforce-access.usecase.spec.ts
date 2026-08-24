import * as result from '@pressly/cells/result';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, it, vi } from 'vitest';
import { grantWorkforceAccessCellDeclaration } from './cell.ts';
import type { GrantWorkforceAccessStore } from './grant-workforce-access.port.ts';
import { makeGrantWorkforceAccess } from './grant-workforce-access.usecase.ts';

const now = new Date('2026-08-22T16:00:00.000Z');
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

describe('grant workforce access', () => {
  proveOperation({
    operationId: 'access.grant-workforce-access.v1',
    declaration: grantWorkforceAccessCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'normalizes optional bounds and fingerprints the persisted command',
        proves: ['contract', 'executor-success'],
        run: async () => {
          const input = {
            actor,
            businessId: 'business-id',
            membershipId: 'membership-id',
            identityId: 'operator-id',
            role: 'operator' as const,
            scope: { kind: 'location' as const, id: 'location-id' },
            idempotencyKey: 'grant-1',
          };
          expect(
            grantWorkforceAccessCellDeclaration.contract.input.decode(input)
              .kind,
          ).toBe('valid');
          const store: GrantWorkforceAccessStore = {
            grant: vi.fn(async () => ({
              status: 'applied' as const,
              value: grant,
            })),
          };
          const grantAccess = makeGrantWorkforceAccess({
            store,
            clock: { now: () => now },
          });

          const actual = await grantAccess(input);

          expect(actual).toEqual(result.ok(grant));
          expect(store.grant).toHaveBeenCalledWith(
            expect.objectContaining({
              actor,
              startsAt: null,
              endsAt: null,
              idempotencyKey: 'grant-1',
              commandHash: expect.stringMatching(/^[a-f0-9]{64}$/),
            }),
          );
        },
      },
    ],
  });

  it('rejects an inverted access window before touching persistence', async () => {
    const store: GrantWorkforceAccessStore = { grant: vi.fn() };
    const grantAccess = makeGrantWorkforceAccess({
      store,
      clock: { now: () => now },
    });

    const actual = await grantAccess({
      actor,
      businessId: 'business-id',
      membershipId: 'membership-id',
      identityId: 'operator-id',
      role: 'operator',
      scope: { kind: 'location', id: 'location-id' },
      startsAt: now,
      endsAt: now,
      idempotencyKey: 'grant-1',
    });

    expect(actual).toMatchObject({
      tag: 'err',
      error: { kind: 'conflict', code: 'workforce_invalid_state' },
    });
    expect(store.grant).not.toHaveBeenCalled();
  });

  it('rejects an invalid identifier as validation before persistence', async () => {
    const store: GrantWorkforceAccessStore = { grant: vi.fn() };
    const grantAccess = makeGrantWorkforceAccess({
      store,
      clock: { now: () => now },
    });

    await expect(
      grantAccess({
        actor,
        businessId: ' ',
        membershipId: 'membership-id',
        identityId: 'operator-id',
        role: 'operator',
        scope: { kind: 'location', id: 'location-id' },
        idempotencyKey: 'grant-invalid',
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { kind: 'validation' },
    });
    expect(store.grant).not.toHaveBeenCalled();
  });

  it('preserves an idempotency conflict as typed expected data', async () => {
    const grantAccess = makeGrantWorkforceAccess({
      store: {
        grant: vi.fn(async () => ({
          status: 'rejected' as const,
          reason: 'idempotency_conflict' as const,
        })),
      },
      clock: { now: () => now },
    });

    const actual = await grantAccess({
      actor,
      businessId: 'business-id',
      membershipId: 'membership-id',
      identityId: 'operator-id',
      role: 'operator',
      scope: { kind: 'location', id: 'location-id' },
      idempotencyKey: 'grant-1',
    });

    expect(actual).toMatchObject({
      tag: 'err',
      error: { kind: 'conflict', code: 'workforce_idempotency_conflict' },
    });
  });

  it.each([
    {
      name: 'authentication',
      reason: 'authentication_required' as const,
      expectedKind: 'authentication' as const,
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
    const store: GrantWorkforceAccessStore = {
      grant: vi.fn(async () => ({
        status: 'rejected' as const,
        reason: testCase.reason,
      })),
    };
    const grantAccess = makeGrantWorkforceAccess({
      store,
      clock: { now: () => now },
    });

    await expect(
      grantAccess({
        actor,
        businessId: 'business-id',
        membershipId: 'membership-id',
        identityId: 'operator-id',
        role: 'operator',
        scope: { kind: 'location', id: 'location-id' },
        idempotencyKey: `grant-${testCase.name}`,
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { kind: testCase.expectedKind },
    });
    expect(store.grant).toHaveBeenCalledOnce();
  });
});
