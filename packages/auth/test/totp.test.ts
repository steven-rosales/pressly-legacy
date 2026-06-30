import { Secret, TOTP } from 'otpauth';
import { describe, expect, it } from 'vitest';
import { makeTotpAuthenticator } from '../src/credentials/totp.ts';

describe('TOTP authenticator', () => {
  it('creates authenticator-compatible enrollment URIs', () => {
    const authenticator = makeTotpAuthenticator();
    const secret = authenticator.generateSecret();
    const uri = authenticator.enrollmentUri({
      secret,
      issuer: 'Pressly',
      label: 'owner@pressly.test',
    });

    expect(uri).toContain('otpauth://totp/Pressly:owner%40pressly.test');
    expect(uri).toContain(`secret=${secret}`);
  });

  it('returns the accepted counter for replay protection', () => {
    const authenticator = makeTotpAuthenticator();
    const secret = authenticator.generateSecret();
    const now = new Date('2026-06-29T12:00:00.000Z');
    const token = TOTP.generate({
      secret: Secret.fromBase32(secret),
      timestamp: now.getTime(),
    });

    expect(authenticator.verify({ secret, token, now })).toEqual({
      valid: true,
      counter: TOTP.counter({ timestamp: now.getTime() }),
    });
  });

  it('rejects malformed and invalid codes', () => {
    const authenticator = makeTotpAuthenticator();
    const secret = authenticator.generateSecret();
    const now = new Date('2026-06-29T12:00:00.000Z');

    expect(authenticator.verify({ secret, token: 'not-otp', now })).toEqual({
      valid: false,
    });
    expect(authenticator.verify({ secret, token: '000000', now })).toEqual({
      valid: false,
    });
  });
});
