import { invariantViolationError } from '@pressly/errors/factories';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, it, vi } from 'vitest';
import { removeMfaCellDeclaration } from './cell.ts';
import { makeRemoveMfa } from './remove-mfa.usecase.ts';

const now = new Date('2026-08-22T16:00:00.000Z');

describe('remove MFA', () => {
  proveOperation({
    operationId: 'access.remove-mfa.v1',
    declaration: removeMfaCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'removes MFA and emits the mutation only after persistence',
        proves: ['contract', 'executor-success'],
        run: async () => {
          const input = {
            identityId: 'identity-id',
            sessionId: 'session-id',
            requestId: 'request-id',
          };
          expect(
            removeMfaCellDeclaration.contract.input.decode(input).kind,
          ).toBe('valid');
          const removeMfa = vi.fn(async () => undefined);
          const emit = vi.fn();
          const remove = makeRemoveMfa({
            store: { removeMfa },
            clock: { now: () => now },
            securityEvents: { emit },
          });

          await expect(remove(input)).resolves.toEqual({ updated: true });
          expect(removeMfa).toHaveBeenCalledWith({
            identityId: 'identity-id',
            sessionId: 'session-id',
            now,
          });
          expect(emit).toHaveBeenCalledWith(
            expect.objectContaining({
              action: 'auth:mfa:removed',
              principalId: 'identity-id',
              sessionId: 'session-id',
            }),
          );
        },
      },
    ],
  });

  it('does not report or emit success when the transactional removal fails', async () => {
    const failure = invariantViolationError({
      code: 'remove_mfa_test_failure',
      message: 'Remove failed.',
    });
    const emit = vi.fn();
    const remove = makeRemoveMfa({
      store: { removeMfa: vi.fn(async () => Promise.reject(failure)) },
      clock: { now: () => now },
      securityEvents: { emit },
    });

    await expect(
      remove({ identityId: 'identity-id', sessionId: 'session-id' }),
    ).rejects.toBe(failure);
    expect(emit).not.toHaveBeenCalled();
  });
});
