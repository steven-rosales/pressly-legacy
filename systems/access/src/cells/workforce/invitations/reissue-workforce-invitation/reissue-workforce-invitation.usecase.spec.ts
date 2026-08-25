import * as result from '@pressly/cells/result';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, it, vi } from 'vitest';
import { reissueWorkforceInvitationCellDeclaration } from './cell.ts';
import { makeReissueWorkforceInvitation } from './reissue-workforce-invitation.usecase.ts';
import {
  makeInvitationTokenServiceFake,
  makeWorkforceInvitationStoreFake,
  workforceActor,
  workforceInvitation,
  workforceInvitationNow,
} from '../../../../testing/workforce-invitation-store.spec-support.ts';

const captureError = (action: () => unknown): unknown => {
  try {
    action();
    return null;
  } catch (error) {
    return error;
  }
};

describe('reissue workforce invitation', () => {
  it('rejects invalid invitation TTL configuration', () => {
    expect(
      captureError(() =>
        makeReissueWorkforceInvitation({
          store: makeWorkforceInvitationStoreFake(),
          tokenService: makeInvitationTokenServiceFake(),
          clock: { now: () => workforceInvitationNow },
          invitationTtlMinutes: 0,
        }),
      ),
    ).toMatchObject({
      tag: 'AppError',
      kind: 'ConfigError',
      code: 'workforce_invitation_ttl_invalid',
      status: 500,
    });
  });

  proveOperation({
    operationId: 'access.reissue-workforce-invitation.v1',
    declaration: reissueWorkforceInvitationCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'does not disclose a replacement token when reissue is replayed',
        proves: ['contract', 'executor-success'],
        run: async () => {
          const input = {
            actor: workforceActor,
            businessId: 'business-id',
            invitationId: workforceInvitation.id,
            expectedVersion: 1,
            idempotencyKey: 'reissue-1',
          };
          expect(
            reissueWorkforceInvitationCellDeclaration.contract.input.decode(
              input,
            ).kind,
          ).toBe('valid');
          const store = makeWorkforceInvitationStoreFake({
            reissue: vi.fn(async () => ({
              status: 'replayed' as const,
              value: workforceInvitation,
            })),
          });
          const reissue = makeReissueWorkforceInvitation({
            store,
            tokenService: makeInvitationTokenServiceFake(),
            clock: { now: () => workforceInvitationNow },
            invitationTtlMinutes: 60,
          });

          const response = await reissue(input);

          expect(response).toEqual(
            result.ok({ status: 'replayed', invitation: workforceInvitation }),
          );
          expect(JSON.stringify(response)).not.toContain(
            'raw-invitation-token',
          );
        },
      },
    ],
  });

  it('returns validation without touching the reissue store', async () => {
    const store = makeWorkforceInvitationStoreFake();
    const reissue = makeReissueWorkforceInvitation({
      store,
      tokenService: makeInvitationTokenServiceFake(),
      clock: { now: () => workforceInvitationNow },
      invitationTtlMinutes: 60,
    });

    await expect(
      reissue({
        actor: workforceActor,
        businessId: 'business-id',
        invitationId: ' ',
        expectedVersion: 1,
        idempotencyKey: 'reissue-invalid',
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { kind: 'validation' },
    });
    expect(store.reissue).not.toHaveBeenCalled();
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
    const store = makeWorkforceInvitationStoreFake({
      reissue: vi.fn(async () => ({
        status: 'rejected' as const,
        reason: testCase.reason,
      })),
    });
    const reissue = makeReissueWorkforceInvitation({
      store,
      tokenService: makeInvitationTokenServiceFake(),
      clock: { now: () => workforceInvitationNow },
      invitationTtlMinutes: 60,
    });

    await expect(
      reissue({
        actor: workforceActor,
        businessId: 'business-id',
        invitationId: workforceInvitation.id,
        expectedVersion: 1,
        idempotencyKey: `reissue-${testCase.name}`,
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { kind: testCase.expectedKind },
    });
    expect(store.reissue).toHaveBeenCalledOnce();
  });
});
