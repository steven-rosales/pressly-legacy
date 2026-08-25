import * as result from '@pressly/cells/result';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, it, vi } from 'vitest';
import { confirmMfaEnrollmentCellDeclaration } from './cell.ts';
import type { ConfirmMfaEnrollmentStore } from './confirm-mfa-enrollment.port.ts';
import { makeConfirmMfaEnrollment } from './confirm-mfa-enrollment.usecase.ts';

const now = new Date('2026-08-22T16:00:00.000Z');
const credential = {
  identityId: 'identity-id',
  encryptedSecret: 'encrypted-secret',
  status: 'pending' as const,
  lastUsedCounter: null,
};

const makeSubject = (
  store: ConfirmMfaEnrollmentStore,
  verification: Readonly<{ valid: boolean; counter?: number }> = {
    valid: true,
    counter: 42,
  },
) => {
  const emit = vi.fn();
  const confirm = makeConfirmMfaEnrollment({
    store,
    totp: {
      generateSecret: vi.fn(),
      enrollmentUri: vi.fn(),
      verify: () => verification,
    },
    secretBox: { encrypt: vi.fn(), decrypt: () => 'BASE32SECRET' },
    recoveryCodes: {
      generate: () => ['code-one', 'code-two'],
      hash: (code) => `hash:${code}`,
    },
    clock: { now: () => now },
    securityEvents: { emit },
  });
  return { confirm, emit };
};

describe('confirm MFA enrollment', () => {
  proveOperation({
    operationId: 'access.confirm-mfa-enrollment.v1',
    declaration: confirmMfaEnrollmentCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'enables the credential stores only hashes and emits after commit',
        proves: ['contract', 'executor-success'],
        run: async () => {
          const input = {
            identityId: 'identity-id',
            sessionId: 'session-id',
            code: '123456',
            requestId: 'request-id',
          };
          expect(
            confirmMfaEnrollmentCellDeclaration.contract.input.decode(input)
              .kind,
          ).toBe('valid');
          const confirmEnrollment = vi.fn(async () => true);
          const { confirm, emit } = makeSubject({
            findCredential: vi.fn(async () => credential),
            confirmEnrollment,
          });

          const actual = await confirm(input);

          expect(actual).toEqual(
            result.ok({ recoveryCodes: ['code-one', 'code-two'] }),
          );
          expect(confirmEnrollment).toHaveBeenCalledWith({
            identityId: 'identity-id',
            sessionId: 'session-id',
            counter: 42,
            recoveryCodeHashes: ['hash:code-one', 'hash:code-two'],
            now,
          });
          expect(emit).toHaveBeenCalledWith(
            expect.objectContaining({
              name: 'mfa.enrolled',
              outcome: 'succeeded',
              requestId: 'request-id',
            }),
          );
        },
      },
    ],
  });

  it('does not generate or persist recovery codes when enrollment is missing', async () => {
    const confirmEnrollment = vi.fn(async () => true);
    const { confirm, emit } = makeSubject({
      findCredential: vi.fn(async () => undefined),
      confirmEnrollment,
    });

    const actual = await confirm({
      identityId: 'identity-id',
      sessionId: 'session-id',
      code: '123456',
    });

    expect(actual).toMatchObject({
      tag: 'err',
      error: { code: 'mfa_enrollment_missing' },
    });
    expect(confirmEnrollment).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('treats a lost counter race as an invalid-code failure without emitting success', async () => {
    const { confirm, emit } = makeSubject({
      findCredential: vi.fn(async () => credential),
      confirmEnrollment: vi.fn(async () => false),
    });

    const actual = await confirm({
      identityId: 'identity-id',
      sessionId: 'session-id',
      code: '123456',
    });

    expect(actual).toMatchObject({
      tag: 'err',
      error: { code: 'invalid_mfa_code' },
    });
    expect(emit).not.toHaveBeenCalled();
  });
});
