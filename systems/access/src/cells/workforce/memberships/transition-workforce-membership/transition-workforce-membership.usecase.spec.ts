import * as result from '@pressly/cells/result';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, it, vi } from 'vitest';
import { transitionWorkforceMembershipCellDeclaration } from './cell.ts';
import { makeTransitionWorkforceMembership } from './transition-workforce-membership.usecase.ts';
import type { TransitionWorkforceMembershipStore } from './transition-workforce-membership.port.ts';

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
const member = {
  membershipId: 'membership-id',
  businessId: 'business-id',
  identityId: 'operator-id',
  displayName: 'Operator',
  email: 'operator@example.com',
  state: 'active' as const,
  version: 2,
  mfaEnabled: false,
  grants: [grant],
  startedAt: now,
  suspendedAt: null,
  endedAt: null,
  activeSessionCount: 0,
  createdAt: now,
  updatedAt: now,
};

const makeMembershipStore = (
  overrides: Partial<TransitionWorkforceMembershipStore> = {},
): TransitionWorkforceMembershipStore => ({
  transition: vi.fn(async () => ({
    status: 'applied' as const,
    value: { member, revokedSessionCount: 3 },
  })),
  ...overrides,
});

describe('transition workforce membership', () => {
  proveOperation({
    operationId: 'access.transition-workforce-membership.v1',
    declaration: transitionWorkforceMembershipCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'sends every versioned idempotent membership graph event',
        proves: ['contract', 'executor-success'],
        run: async () => {
          for (const event of ['suspend', 'reactivate', 'end'] as const) {
            const input = {
              actor,
              businessId: 'business-id',
              membershipId: 'membership-id',
              expectedVersion: 1,
              reason: 'manager confirmed',
              idempotencyKey: `${event}-1`,
            };
            expect(
              transitionWorkforceMembershipCellDeclaration.contract.input.decode(
                { ...input, event },
              ).kind,
            ).toBe('valid');
            const store = makeMembershipStore();
            const transition = makeTransitionWorkforceMembership({
              store,
              clock: { now: () => now },
              event,
            });

            const response = await transition(input);

            expect(response).toEqual(
              result.ok({ member, revokedSessionCount: 3 }),
            );
            expect(store.transition).toHaveBeenCalledWith(
              expect.objectContaining({
                event,
                expectedVersion: 1,
                idempotencyKey: `${event}-1`,
                commandHash: expect.stringMatching(/^[a-f0-9]{64}$/),
              }),
            );
          }
        },
      },
    ],
  });

  it('surfaces stale races with the current version', async () => {
    const store = makeMembershipStore({
      transition: vi.fn(async () => ({
        status: 'rejected' as const,
        reason: 'stale_version' as const,
        currentVersion: 4,
      })),
    });
    const suspend = makeTransitionWorkforceMembership({
      store,
      clock: { now: () => now },
      event: 'suspend',
    });
    const response = await suspend({
      actor,
      businessId: 'business-id',
      membershipId: 'membership-id',
      expectedVersion: 1,
      idempotencyKey: 'suspend-race',
    });

    expect(response.tag).toBe('err');
    if (response.tag === 'err') {
      expect(response.error.kind).toBe('conflict');
      expect(response.error.code).toBe('workforce_stale_version');
      expect(response.error.details).toEqual({ currentVersion: 4 });
    }
  });

  it('preserves serialized last-owner denial as an expected conflict', async () => {
    const store = makeMembershipStore({
      transition: vi.fn(async () => ({
        status: 'rejected' as const,
        reason: 'last_owner' as const,
      })),
    });
    const end = makeTransitionWorkforceMembership({
      store,
      clock: { now: () => now },
      event: 'end',
    });
    const response = await end({
      actor,
      businessId: 'business-id',
      membershipId: 'owner-membership',
      expectedVersion: 2,
      idempotencyKey: 'end-last-owner',
    });

    expect(response.tag).toBe('err');
    if (response.tag === 'err') {
      expect(response.error.kind).toBe('conflict');
      expect(response.error.code).toBe('workforce_last_owner');
    }
  });

  it('returns validation without touching the transition store', async () => {
    const store = makeMembershipStore();
    const transition = makeTransitionWorkforceMembership({
      store,
      clock: { now: () => now },
      event: 'suspend',
    });

    await expect(
      transition({
        actor,
        businessId: 'business-id',
        membershipId: ' ',
        expectedVersion: 1,
        idempotencyKey: 'transition-invalid',
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { kind: 'validation' },
    });
    expect(store.transition).not.toHaveBeenCalled();
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
  ])('returns a typed $name transition rejection', async (testCase) => {
    const store = makeMembershipStore({
      transition: vi.fn(async () => ({
        status: 'rejected' as const,
        reason: testCase.reason,
      })),
    });
    const transition = makeTransitionWorkforceMembership({
      store,
      clock: { now: () => now },
      event: 'suspend',
    });

    await expect(
      transition({
        actor,
        businessId: 'business-id',
        membershipId: 'membership-id',
        expectedVersion: 1,
        idempotencyKey: `transition-${testCase.name}`,
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { kind: testCase.expectedKind },
    });
    expect(store.transition).toHaveBeenCalledOnce();
  });
});
