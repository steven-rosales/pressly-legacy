import { describe, expect, it } from 'vitest';

import {
  isSessionExpired,
  isSessionRevoked,
  sessionAgeMinutes,
} from '../src/authentication/index.ts';

describe('isSessionExpired', () => {
  const now = new Date('2026-05-27T12:00:00.000Z');

  it('expires sessions at the exact expiry time', () => {
    expect(isSessionExpired({ expiresAt: now }, now)).toBe(true);
  });

  it('expires session before now and keeps future sessions active', () => {
    expect(
      isSessionExpired(
        { expiresAt: new Date('2026-05-27T11:59:59.999Z') },
        now,
      ),
    ).toBe(true);
    expect(
      isSessionExpired(
        { expiresAt: new Date('2026-05-27T12:00:00.001Z') },
        now,
      ),
    ).toBe(false);
  });
});

describe('isSessionRevoked', () => {
  it('treats undefined and null revocation times as active', () => {
    expect(isSessionRevoked({})).toBe(false);
    expect(isSessionRevoked({ revokedAt: null })).toBe(false);
  });

  it('treats any revocation date as revoked', () => {
    expect(
      isSessionRevoked({ revokedAt: new Date('2026-05-27T12:00:00.000Z') }),
    ).toBe(true);
  });
});

describe('sessionAgeMinutes', () => {
  const now = new Date('2026-05-27T12:30:30.000Z');

  it('floors age to whole minutes', () => {
    expect(
      sessionAgeMinutes(
        { issuedAt: new Date('2026-05-27T12:00:31.000Z') },
        now,
      ),
    ).toBe(29);
  });

  it('clamps future issued sessions to zero minutes old', () => {
    expect(
      sessionAgeMinutes(
        { issuedAt: new Date('2026-05-27T12:31:00.000Z') },
        now,
      ),
    ).toBe(0);
  });
});
