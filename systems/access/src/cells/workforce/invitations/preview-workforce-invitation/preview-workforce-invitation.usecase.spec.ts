import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, it, vi } from 'vitest';
import { previewWorkforceInvitationCellDeclaration } from './cell.ts';
import { makePreviewWorkforceInvitation } from './preview-workforce-invitation.usecase.ts';
import {
  makeInvitationTokenServiceFake,
  makeWorkforceInvitationStoreFake,
  workforceInvitationNow,
} from '../../../../testing/workforce-invitation-store.spec-support.ts';

describe('preview workforce invitation', () => {
  proveOperation({
    operationId: 'access.preview-workforce-invitation.v1',
    declaration: previewWorkforceInvitationCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'returns the safe invitation projection for an available token',
        proves: ['contract', 'executor-success'],
        run: async () => {
          const input = 'invite';
          expect(
            previewWorkforceInvitationCellDeclaration.contract.input.decode(
              input,
            ).kind,
          ).toBe('valid');
          const store = makeWorkforceInvitationStoreFake();
          const tokenService = makeInvitationTokenServiceFake();
          const preview = makePreviewWorkforceInvitation({
            store,
            tokenService,
            clock: { now: () => workforceInvitationNow },
          });

          const response = await preview(input);

          expect(response).toMatchObject({
            tag: 'ok',
            value: { businessName: 'Pressly', existingIdentity: false },
          });
          expect(tokenService.hash).toHaveBeenCalledWith(input);
        },
      },
    ],
  });

  it('returns a safe expected failure for an expired token', async () => {
    const preview = makePreviewWorkforceInvitation({
      store: makeWorkforceInvitationStoreFake({
        preview: vi.fn(async () => ({
          status: 'rejected' as const,
          reason: 'expired_token' as const,
        })),
      }),
      tokenService: makeInvitationTokenServiceFake(),
      clock: { now: () => workforceInvitationNow },
    });

    const response = await preview('invite');

    expect(response).toMatchObject({
      tag: 'err',
      error: { kind: 'conflict', code: 'workforce_expired_token' },
    });
  });

  it('returns validation without querying an empty invitation token', async () => {
    const store = makeWorkforceInvitationStoreFake();
    const preview = makePreviewWorkforceInvitation({
      store,
      tokenService: makeInvitationTokenServiceFake(),
      clock: { now: () => workforceInvitationNow },
    });

    await expect(preview(' ')).resolves.toMatchObject({
      tag: 'err',
      error: { kind: 'validation' },
    });
    expect(store.preview).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'not found',
      reason: 'invalid_token' as const,
      expectedKind: 'not_found' as const,
    },
  ])('returns a typed $name preview rejection', async (testCase) => {
    const store = makeWorkforceInvitationStoreFake({
      preview: vi.fn(async () => ({
        status: 'rejected' as const,
        reason: testCase.reason,
      })),
    });
    const preview = makePreviewWorkforceInvitation({
      store,
      tokenService: makeInvitationTokenServiceFake(),
      clock: { now: () => workforceInvitationNow },
    });

    await expect(preview('invite')).resolves.toMatchObject({
      tag: 'err',
      error: { kind: testCase.expectedKind },
    });
    expect(store.preview).toHaveBeenCalledOnce();
  });
});
