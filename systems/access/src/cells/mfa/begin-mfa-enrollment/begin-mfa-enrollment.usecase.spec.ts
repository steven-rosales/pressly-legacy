import * as result from '@pressly/cells/result';
import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, it, vi } from 'vitest';
import type { BeginMfaEnrollmentStore } from './begin-mfa-enrollment.port.ts';
import { makeBeginMfaEnrollment } from './begin-mfa-enrollment.usecase.ts';
import { beginMfaEnrollmentCellDeclaration } from './cell.ts';

const now = new Date('2026-08-22T16:00:00.000Z');

const makeSubject = (store: BeginMfaEnrollmentStore) => {
  const encrypt = vi.fn(() => 'encrypted-secret');
  const enrollmentUri = vi.fn(() => 'otpauth://totp/Pressly:owner');
  return {
    begin: makeBeginMfaEnrollment({
      store,
      totp: {
        generateSecret: () => 'BASE32SECRET',
        enrollmentUri,
        verify: vi.fn(),
      },
      secretBox: { encrypt, decrypt: vi.fn() },
      clock: { now: () => now },
      issuer: 'Pressly',
    }),
    encrypt,
    enrollmentUri,
  };
};

describe('begin MFA enrollment', () => {
  proveOperation({
    operationId: 'access.begin-mfa-enrollment.v1',
    declaration: beginMfaEnrollmentCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'persists only the encrypted secret and returns enrollment material',
        proves: ['contract', 'executor-success'],
        run: async () => {
          const input = { identityId: 'identity-id', label: 'owner' };
          expect(
            beginMfaEnrollmentCellDeclaration.contract.input.decode(input).kind,
          ).toBe('valid');
          const beginEnrollment = vi.fn(async () => 'pending' as const);
          const { begin, encrypt, enrollmentUri } = makeSubject({
            beginEnrollment,
          });

          const actual = await begin(input);

          expect(actual).toEqual(
            result.ok({
              secret: 'BASE32SECRET',
              enrollmentUri: 'otpauth://totp/Pressly:owner',
            }),
          );
          expect(encrypt).toHaveBeenCalledWith('BASE32SECRET');
          expect(beginEnrollment).toHaveBeenCalledWith({
            identityId: 'identity-id',
            encryptedSecret: 'encrypted-secret',
            now,
          });
          expect(enrollmentUri).toHaveBeenCalledWith({
            secret: 'BASE32SECRET',
            issuer: 'Pressly',
            label: 'owner',
          });
        },
      },
    ],
  });

  it('returns the stable already-enabled failure without disclosing enrollment material', async () => {
    const { begin } = makeSubject({
      beginEnrollment: vi.fn(async () => 'already_enabled' as const),
    });

    const actual = await begin({ identityId: 'identity-id', label: 'owner' });

    expect(actual).toMatchObject({
      tag: 'err',
      error: { code: 'mfa_already_enabled' },
    });
    expect(JSON.stringify(actual)).not.toContain('BASE32SECRET');
  });
});
