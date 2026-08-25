import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, it, vi } from 'vitest';
import { acceptWorkforceInvitationCellDeclaration } from './cell.ts';
import { makeAcceptWorkforceInvitation } from './accept-workforce-invitation.usecase.ts';
import {
  makeInvitationTokenServiceFake,
  makeWorkforceInvitationStoreFake,
  workforceInvitationNow,
} from '../../../../testing/workforce-invitation-store.spec-support.ts';

describe('accept workforce invitation', () => {
  it('requires a strong self-selected password for a new identity', async () => {
    const store = makeWorkforceInvitationStoreFake();
    const accept = makeAcceptWorkforceInvitation({
      store,
      tokenService: makeInvitationTokenServiceFake(),
      passwordHasher: { hash: vi.fn(async () => 'password-hash') },
      clock: { now: () => workforceInvitationNow },
    });
    const response = await accept({
      rawToken: 'invite',
      idempotencyKey: 'accept-1',
      acceptance: { kind: 'new_identity', password: 'weak' },
    });

    expect(response).toMatchObject({
      tag: 'err',
      error: { kind: 'validation', code: 'weak_invitation_password' },
    });
    expect(store.accept).not.toHaveBeenCalled();
  });

  proveOperation({
    operationId: 'access.accept-workforce-invitation.v1',
    declaration: acceptWorkforceInvitationCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'requires the existing identity and active session instead of auto-linking',
        proves: ['contract', 'executor-success'],
        run: async () => {
          const input = {
            rawToken: 'invite',
            idempotencyKey: 'accept-2',
            acceptance: {
              kind: 'existing_identity' as const,
              authenticatedIdentityId: 'identity-id',
              authenticatedSessionId: 'session-id',
            },
          };
          expect(
            acceptWorkforceInvitationCellDeclaration.contract.input.decode(
              input,
            ).kind,
          ).toBe('valid');
          const store = makeWorkforceInvitationStoreFake();
          const passwordHasher = { hash: vi.fn(async () => 'password-hash') };
          const accept = makeAcceptWorkforceInvitation({
            store,
            tokenService: makeInvitationTokenServiceFake(),
            passwordHasher,
            clock: { now: () => workforceInvitationNow },
          });

          const response = await accept(input);

          expect(response.tag).toBe('ok');
          expect(passwordHasher.hash).not.toHaveBeenCalled();
          expect(store.accept).toHaveBeenCalledWith(
            expect.objectContaining({
              tokenHash: 'hashed:invite',
              acceptance: input.acceptance,
            }),
          );
        },
      },
    ],
  });

  it('returns a safe failure when identity authentication is required', async () => {
    const accept = makeAcceptWorkforceInvitation({
      store: makeWorkforceInvitationStoreFake({
        accept: vi.fn(async () => ({
          status: 'rejected' as const,
          reason: 'authentication_required' as const,
        })),
      }),
      tokenService: makeInvitationTokenServiceFake(),
      passwordHasher: { hash: vi.fn(async () => 'password-hash') },
      clock: { now: () => workforceInvitationNow },
    });
    const response = await accept({
      rawToken: 'invite',
      idempotencyKey: 'accept-3',
      acceptance: {
        kind: 'new_identity',
        password: 'Long-Enough-Password-123!',
      },
    });

    expect(response).toMatchObject({
      tag: 'err',
      error: {
        kind: 'authentication',
        code: 'invitation_identity_authentication_required',
      },
    });
  });

  it.each([
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
      accept: vi.fn(async () => ({
        status: 'rejected' as const,
        reason: testCase.reason,
      })),
    });
    const accept = makeAcceptWorkforceInvitation({
      store,
      tokenService: makeInvitationTokenServiceFake(),
      passwordHasher: { hash: vi.fn(async () => 'password-hash') },
      clock: { now: () => workforceInvitationNow },
    });

    const response = await accept({
      rawToken: 'invite',
      idempotencyKey: `accept-${testCase.name}`,
      acceptance: {
        kind: 'new_identity',
        password: 'Long-Enough-Password-123!',
      },
    });

    expect(response).toMatchObject({
      tag: 'err',
      error: { kind: testCase.expectedKind },
    });
    expect(store.accept).toHaveBeenCalledOnce();
  });
});
