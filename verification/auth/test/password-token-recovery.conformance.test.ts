import { Buffer } from 'node:buffer';
import {
  makePasswordHasher,
  makePasswordVerifier,
} from '@pressly/auth-platform/passwords';
import { makeRecoveryCodeService } from '@pressly/auth-platform/recovery-codes';
import { makeTokenIssuer } from '@pressly/auth-platform/tokens';
import { unexpectedError } from '@pressly/errors/factories';
import { describe, expect, it } from 'vitest';

const errorShape = (error: unknown) => {
  const candidate = error as Readonly<{
    kind?: unknown;
    code?: unknown;
    message?: unknown;
    safeMessage?: unknown;
    status?: unknown;
  }>;
  return {
    kind: candidate.kind,
    code: candidate.code,
    message: candidate.message,
    safeMessage: candidate.safeMessage,
    status: candidate.status,
  };
};

describe('password mechanism conformance', () => {
  it('cross-verifies independently salted Argon hashes and wrong passwords', async () => {
    const hasher = makePasswordHasher();
    const verifier = makePasswordVerifier();
    const password = 'CorrectHorse1!Battery';

    const [firstHash, secondHash] = await Promise.all([
      hasher.hash(password),
      hasher.hash(password),
    ]);
    expect(firstHash).toMatch(/^\$argon2/u);
    expect(secondHash).toMatch(/^\$argon2/u);
    expect(firstHash).not.toBe(secondHash);
    await expect(verifier.verify(firstHash, password)).resolves.toBe(true);
    await expect(verifier.verify(secondHash, password)).resolves.toBe(true);
    await expect(
      verifier.verify(firstHash, 'WrongHorse1!Battery'),
    ).resolves.toBe(false);
  });

  it('pins Access-mapped hashing and verification failure envelopes', async () => {
    const fault = unexpectedError({
      code: 'synthetic_argon_fault',
      message: 'Synthetic Argon fault.',
    });
    const hasher = makePasswordHasher({
      hashPassword: async () => Promise.reject(fault),
      hashFailure: (cause) =>
        unexpectedError({
          code: 'password_hashing_failed',
          message: 'Password hashing failed.',
          safeMessage: 'Password could not be saved.',
          cause,
        }),
    });
    let hashError: unknown;
    try {
      await hasher.hash('CorrectHorse1!Battery');
    } catch (error) {
      hashError = errorShape(error);
    }
    expect(hashError).toEqual({
      kind: 'UnexpectedError',
      code: 'password_hashing_failed',
      message: 'Password hashing failed.',
      safeMessage: 'Password could not be saved.',
      status: 500,
    });

    const verifier = makePasswordVerifier({
      verificationFailure: (cause) =>
        unexpectedError({
          code: 'password_verification_failed',
          message: 'Password verification failed.',
          safeMessage: 'Invalid email or password.',
          cause,
        }),
    });
    let verificationError: unknown;
    try {
      await verifier.verify('not-an-argon-hash', 'password');
    } catch (error) {
      verificationError = errorShape(error);
    }
    expect(verificationError).toEqual({
      kind: 'UnexpectedError',
      code: 'password_verification_failed',
      message: 'Password verification failed.',
      safeMessage: 'Invalid email or password.',
      status: 500,
    });
  });

  it('uses neutral default mechanism failures when Access does not map them', async () => {
    const hashFailure = makePasswordHasher({
      hashPassword: async () =>
        Promise.reject(
          unexpectedError({ code: 'synthetic_hash', message: 'Synthetic.' }),
        ),
    });
    await expect(hashFailure.hash('password')).rejects.toMatchObject({
      code: 'password_hash_operation_failed',
      safeMessage: 'The credential operation failed.',
    });
    await expect(
      makePasswordVerifier().verify('not-an-argon-hash', 'password'),
    ).rejects.toMatchObject({
      code: 'password_verification_operation_failed',
      safeMessage: 'The credential operation failed.',
    });
  });
});

describe('opaque token mechanism conformance', () => {
  it('pins exact HMAC hashes for fixed bytes and domain secrets', () => {
    const rawToken = 'fixed-token-for-parity';
    const target = makeTokenIssuer('first-secret');

    expect(target.hash(rawToken)).toBe(
      '416d6368857135e2de304e169f1a8b414038c4965efb0c8ea3a388fc0fd40e46',
    );
    expect(makeTokenIssuer('second-secret').hash(rawToken)).not.toBe(
      target.hash(rawToken),
    );
  });

  it('retains 32 random bytes encoded as unique base64url tokens', () => {
    const issuer = makeTokenIssuer('token-secret');
    const issued = Array.from({ length: 128 }, () => issuer.issue());
    expect(new Set(issued)).toHaveLength(issued.length);
    for (const token of issued) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
      expect(Buffer.from(token, 'base64url')).toHaveLength(32);
      expect(issuer.hash(token)).toMatch(/^[a-f0-9]{64}$/u);
    }
  });
});

describe('recovery-code mechanism conformance', () => {
  it('pins exact normalization and SHA-256 hashes', () => {
    const target = makeRecoveryCodeService();
    for (const code of [
      'A1B2-C3D4-E5F6-0718-192A-3B4C',
      ' a1b2-c3d4-e5f6-0718-192a-3b4c ',
      'A1B2C3D4E5F60718192A3B4C',
    ])
      expect(target.hash(code)).toBe(
        '923d1dd82631dab3365727d749cdf76e94b0082e0d7384b47a9b5934c02339b2',
      );
    expect(target.hash('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('retains count, entropy width, grouping, and uniqueness behavior', () => {
    const service = makeRecoveryCodeService();
    expect(service.generate(0)).toEqual([]);
    const codes = service.generate(64);
    expect(codes).toHaveLength(64);
    expect(new Set(codes)).toHaveLength(64);
    expect(
      codes.every((code) => /^[A-F0-9]{4}(?:-[A-F0-9]{4}){5}$/u.test(code)),
    ).toBe(true);
    expect(
      codes.every(
        (code) => Buffer.from(code.replaceAll('-', ''), 'hex').length === 12,
      ),
    ).toBe(true);
  });
});
