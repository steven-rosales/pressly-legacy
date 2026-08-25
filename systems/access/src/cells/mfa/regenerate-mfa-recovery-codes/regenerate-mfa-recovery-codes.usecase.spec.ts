import { invariantViolationError } from '@pressly/errors/factories';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, it, vi } from 'vitest';
import { regenerateMfaRecoveryCodesCellDeclaration } from './cell.ts';
import { makeRegenerateMfaRecoveryCodes } from './regenerate-mfa-recovery-codes.usecase.ts';

const now = new Date('2026-08-22T16:00:00.000Z');

describe('regenerate MFA recovery codes', () => {
  proveOperation({
    operationId: 'access.regenerate-mfa-recovery-codes.v1',
    declaration: regenerateMfaRecoveryCodesCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'replaces stored hashes returns raw codes once and emits after persistence',
        proves: ['contract', 'executor-success'],
        run: async () => {
          const input = { identityId: 'identity-id', requestId: 'request-id' };
          expect(
            regenerateMfaRecoveryCodesCellDeclaration.contract.input.decode(
              input,
            ).kind,
          ).toBe('valid');
          const replaceRecoveryCodes = vi.fn(async () => undefined);
          const emit = vi.fn();
          const regenerate = makeRegenerateMfaRecoveryCodes({
            store: { replaceRecoveryCodes },
            recoveryCodes: {
              generate: () => ['raw-one', 'raw-two'],
              hash: (code) => `hash:${code}`,
            },
            clock: { now: () => now },
            securityEvents: { emit },
          });

          const actual = await regenerate(input);

          expect(actual).toEqual({ recoveryCodes: ['raw-one', 'raw-two'] });
          expect(replaceRecoveryCodes).toHaveBeenCalledWith({
            identityId: 'identity-id',
            recoveryCodeHashes: ['hash:raw-one', 'hash:raw-two'],
            now,
          });
          expect(emit).toHaveBeenCalledWith(
            expect.objectContaining({
              action: 'auth:mfa:recovery_codes_regenerated',
              requestId: 'request-id',
            }),
          );
        },
      },
    ],
  });

  it('does not emit a successful mutation when replacement fails', async () => {
    const failure = invariantViolationError({
      code: 'regenerate_recovery_codes_test_failure',
      message: 'Replace failed.',
    });
    const emit = vi.fn();
    const regenerate = makeRegenerateMfaRecoveryCodes({
      store: {
        replaceRecoveryCodes: vi.fn(async () => Promise.reject(failure)),
      },
      recoveryCodes: {
        generate: () => ['raw'],
        hash: (code) => `hash:${code}`,
      },
      clock: { now: () => now },
      securityEvents: { emit },
    });

    await expect(regenerate({ identityId: 'identity-id' })).rejects.toBe(
      failure,
    );
    expect(emit).not.toHaveBeenCalled();
  });
});
