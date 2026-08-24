import * as result from '@pressly/cells/result';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, it, vi } from 'vitest';
import { revokeWorkforceInvitationCellDeclaration } from './cell.ts';
import {
  makeWorkforceInvitationStoreFake,
  workforceActor,
  workforceInvitation,
  workforceInvitationNow,
} from '../../../../testing/workforce-invitation-store.spec-support.ts';
import { makeRevokeWorkforceInvitation } from './revoke-workforce-invitation.usecase.ts';

describe('revoke workforce invitation', () => {
  proveOperation({
    operationId: 'access.revoke-workforce-invitation.v1',
    declaration: revokeWorkforceInvitationCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'normalizes reason and fingerprints the optimistic mutation',
        proves: ['contract', 'executor-success'],
        run: async () => {
          const input = {
            actor: workforceActor,
            businessId: 'business-id',
            invitationId: 'invitation-id',
            expectedVersion: 1,
            reason: '  no longer needed  ',
            idempotencyKey: 'revoke-invitation-1',
          };
          expect(
            revokeWorkforceInvitationCellDeclaration.contract.input.decode(
              input,
            ).kind,
          ).toBe('valid');
          const store = makeWorkforceInvitationStoreFake();
          const revoke = makeRevokeWorkforceInvitation({
            store,
            clock: { now: () => workforceInvitationNow },
          });

          const actual = await revoke(input);

          expect(actual).toEqual(result.ok(workforceInvitation));
          expect(store.revoke).toHaveBeenCalledWith(
            expect.objectContaining({
              reason: 'no longer needed',
              expectedVersion: 1,
              idempotencyKey: 'revoke-invitation-1',
              commandHash: expect.stringMatching(/^[a-f0-9]{64}$/),
            }),
          );
        },
      },
    ],
  });

  it('surfaces a stale write with the current version', async () => {
    const revoke = makeRevokeWorkforceInvitation({
      store: makeWorkforceInvitationStoreFake({
        revoke: vi.fn(async () => ({
          status: 'rejected' as const,
          reason: 'stale_version' as const,
          currentVersion: 3,
        })),
      }),
      clock: { now: () => workforceInvitationNow },
    });

    const actual = await revoke({
      actor: workforceActor,
      businessId: 'business-id',
      invitationId: 'invitation-id',
      expectedVersion: 1,
      idempotencyKey: 'revoke-invitation-1',
    });

    expect(actual).toMatchObject({
      tag: 'err',
      error: { kind: 'conflict', code: 'workforce_stale_version' },
    });
  });

  it('returns validation without touching the revoke store', async () => {
    const store = makeWorkforceInvitationStoreFake();
    const revoke = makeRevokeWorkforceInvitation({
      store,
      clock: { now: () => workforceInvitationNow },
    });

    await expect(
      revoke({
        actor: workforceActor,
        businessId: 'business-id',
        invitationId: ' ',
        expectedVersion: 1,
        idempotencyKey: 'revoke-invalid',
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
      revoke: vi.fn(async () => ({
        status: 'rejected' as const,
        reason: testCase.reason,
      })),
    });
    const revoke = makeRevokeWorkforceInvitation({
      store,
      clock: { now: () => workforceInvitationNow },
    });

    await expect(
      revoke({
        actor: workforceActor,
        businessId: 'business-id',
        invitationId: 'invitation-id',
        expectedVersion: 1,
        idempotencyKey: `revoke-${testCase.name}`,
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { kind: testCase.expectedKind },
    });
    expect(store.revoke).toHaveBeenCalledOnce();
  });
});
