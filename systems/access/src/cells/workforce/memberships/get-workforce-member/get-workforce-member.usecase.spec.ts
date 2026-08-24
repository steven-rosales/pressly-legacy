import * as result from '@pressly/cells/result';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, it, vi } from 'vitest';
import { getWorkforceMemberCellDeclaration } from './cell.ts';
import { makeGetWorkforceMember } from './get-workforce-member.usecase.ts';

const now = new Date('2026-08-22T16:00:00.000Z');
const actor = { identityId: 'owner-id', sessionId: 'owner-session' };
const member = {
  membershipId: 'membership-id',
  businessId: 'business-id',
  identityId: 'operator-id',
  state: 'active' as const,
  version: 1,
  startedAt: now,
  suspendedAt: null,
  endedAt: null,
  displayName: 'Operator',
  email: 'operator@pressly.test',
  mfaEnabled: false,
  grants: [],
  activeSessionCount: 2,
  createdAt: now,
  updatedAt: now,
};

describe('get workforce member', () => {
  proveOperation({
    operationId: 'access.get-workforce-member.v1',
    declaration: getWorkforceMemberCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'returns the owner-local detail projection with the query clock',
        proves: ['contract', 'executor-success'],
        run: async () => {
          const input = {
            actor,
            businessId: 'business-id',
            membershipId: 'membership-id',
          };
          expect(
            getWorkforceMemberCellDeclaration.contract.input.decode(input).kind,
          ).toBe('valid');
          const detail = vi.fn(async () => ({
            status: 'found' as const,
            member,
          }));
          const getMember = makeGetWorkforceMember({
            store: { detail },
            clock: { now: () => now },
          });

          const actual = await getMember(input);

          expect(actual).toEqual(result.ok(member));
          expect(detail).toHaveBeenCalledWith({ ...input, now });
        },
      },
    ],
  });

  it('rejects a missing identifier before querying persistence', async () => {
    const detail = vi.fn();
    const getMember = makeGetWorkforceMember({
      store: { detail },
      clock: { now: () => now },
    });

    const actual = await getMember({
      actor,
      businessId: 'business-id',
      membershipId: '   ',
    });

    expect(actual).toMatchObject({
      tag: 'err',
      error: {
        kind: 'validation',
        code: 'invalid_workforce_membership_id',
      },
    });
    expect(detail).not.toHaveBeenCalled();
  });

  it('preserves not-found as typed expected data', async () => {
    const getMember = makeGetWorkforceMember({
      store: {
        detail: vi.fn(async () => ({
          status: 'rejected' as const,
          reason: 'not_found' as const,
        })),
      },
      clock: { now: () => now },
    });

    await expect(
      getMember({
        actor,
        businessId: 'business-id',
        membershipId: 'membership-id',
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { kind: 'not_found', code: 'workforce_record_not_found' },
    });
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
      name: 'permission denial',
      reason: 'outside_business' as const,
      expectedKind: 'permission' as const,
    },
  ])('returns a typed $name detail rejection', async (testCase) => {
    const detail = vi.fn(async () => ({
      status: 'rejected' as const,
      reason: testCase.reason,
    }));
    const getMember = makeGetWorkforceMember({
      store: { detail },
      clock: { now: () => now },
    });

    await expect(
      getMember({
        actor,
        businessId: 'business-id',
        membershipId: 'membership-id',
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { kind: testCase.expectedKind },
    });
    expect(detail).toHaveBeenCalledOnce();
  });
});
