import { randomBytes } from 'node:crypto';
import { makeSecretBox } from '@pressly/auth-platform/secret-box';
import { makeTotpAuthenticator } from '@pressly/auth-platform/totp';
import {
  configError,
  invariantViolationError,
} from '@pressly/errors/factories';
import { Secret, TOTP } from 'otpauth';
import { describe, expect, it } from 'vitest';

const throwableShape = (thunk: () => unknown) => {
  try {
    thunk();
    return null;
  } catch (error) {
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
  }
};

describe('TOTP mechanism conformance', () => {
  it('pins enrollment URI bytes and fixed-clock verification counters', () => {
    const target = makeTotpAuthenticator();
    const secret = 'JBSWY3DPEHPK3PXP';
    const enrollment = {
      secret,
      issuer: 'Issuer / One',
      label: 'owner+tag@example.test',
    };
    expect(target.enrollmentUri(enrollment)).toBe(
      'otpauth://totp/Issuer%20%2F%20One:owner%2Btag%40example.test?issuer=Issuer%20%2F%20One&secret=JBSWY3DPEHPK3PXP&algorithm=SHA1&digits=6&period=30',
    );

    const now = new Date('2026-08-22T16:04:30.000Z');
    for (const offsetSeconds of [-30, 0, 30]) {
      const token = TOTP.generate({
        secret: Secret.fromBase32(secret),
        timestamp: now.getTime() + offsetSeconds * 1_000,
      });
      expect(target.verify({ secret, token, now })).toEqual({
        valid: true,
        counter: Math.floor((now.getTime() + offsetSeconds * 1_000) / 30_000),
      });
    }
    const expired = TOTP.generate({
      secret: Secret.fromBase32(secret),
      timestamp: now.getTime() - 60_000,
    });
    expect(target.verify({ secret, token: expired, now })).toEqual({
      valid: false,
    });
    expect(target.verify({ secret, token: 'not-otp', now })).toEqual({
      valid: false,
    });
  });

  it('retains 20 random secret bytes encoded as unique base32', () => {
    const authenticator = makeTotpAuthenticator();
    const secrets = Array.from({ length: 64 }, () =>
      authenticator.generateSecret(),
    );
    expect(new Set(secrets)).toHaveLength(secrets.length);
    for (const secret of secrets) {
      expect(secret).toMatch(/^[A-Z2-7]+$/u);
      expect(Secret.fromBase32(secret).buffer.byteLength).toBe(20);
    }
  });
});

describe('authenticated secret-box conformance', () => {
  const accessFailures = {
    invalidKey: () =>
      configError({
        code: 'invalid_mfa_encryption_key',
        message: 'AUTH_MFA_ENCRYPTION_KEY must decode to exactly 32 bytes.',
        safeMessage: 'MFA encryption is misconfigured.',
      }),
    invalidEnvelope: () =>
      invariantViolationError({
        code: 'invalid_encrypted_secret_envelope',
        message: 'Stored encrypted secret envelope is invalid.',
      }),
  };

  it('round-trips randomized AES-256-GCM v1 envelopes exactly', () => {
    const key = randomBytes(32).toString('base64');
    const target = makeSecretBox(key);
    const plainText = 'BASE32SECRET-😀';

    const envelopes = [target.encrypt(plainText), target.encrypt(plainText)];
    expect(envelopes[0]).not.toBe(envelopes[1]);
    for (const envelope of envelopes) {
      expect(target.decrypt(envelope)).toBe(plainText);
      const [version, iv, encrypted, tag] = envelope.split('.');
      expect(version).toBe('v1');
      expect(Buffer.from(iv!, 'base64url')).toHaveLength(12);
      expect(Buffer.from(encrypted!, 'base64url').length).toBeGreaterThan(0);
      expect(Buffer.from(tag!, 'base64url')).toHaveLength(16);
      expect(envelope).not.toContain(plainText);
    }
  });

  it('retains random IV uniqueness and authenticated tamper rejection', () => {
    const key = randomBytes(32).toString('base64');
    const box = makeSecretBox(key);
    const envelopes = Array.from({ length: 64 }, () => box.encrypt('same'));
    expect(new Set(envelopes)).toHaveLength(envelopes.length);
    const parts = envelopes[0]!.split('.');
    const tag = Buffer.from(parts[3]!, 'base64url');
    tag[0] = tag[0]! ^ 1;
    parts[3] = tag.toString('base64url');
    expect(() => box.decrypt(parts.join('.'))).toThrow();
  });

  it('pins Access-mapped invalid-key and malformed-envelope error data', () => {
    expect(
      throwableShape(() => makeSecretBox('invalid', accessFailures)),
    ).toEqual({
      kind: 'ConfigError',
      code: 'invalid_mfa_encryption_key',
      message: 'AUTH_MFA_ENCRYPTION_KEY must decode to exactly 32 bytes.',
      safeMessage: 'MFA encryption is misconfigured.',
      status: 500,
    });

    const key = randomBytes(32).toString('base64');
    expect(
      throwableShape(() =>
        makeSecretBox(key, accessFailures).decrypt('invalid'),
      ),
    ).toEqual({
      kind: 'InvariantViolationError',
      code: 'invalid_encrypted_secret_envelope',
      message: 'Stored encrypted secret envelope is invalid.',
      safeMessage: 'An unexpected error occurred.',
      status: 500,
    });
  });

  it('keeps default secret-box failures mechanism-neutral', () => {
    expect(throwableShape(() => makeSecretBox('invalid'))).toMatchObject({
      code: 'invalid_secret_box_key',
      safeMessage: 'Secret encryption is misconfigured.',
    });
    const key = randomBytes(32).toString('base64');
    expect(
      throwableShape(() => makeSecretBox(key).decrypt('invalid')),
    ).toMatchObject({ code: 'invalid_secret_box_envelope' });
  });
});
