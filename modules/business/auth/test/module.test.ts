import { describe, expect, it } from 'vitest';
import type { Database } from '@pressly/db';
import { makeAuthModule } from '../src/main.ts';

describe('auth module composition', () => {
  it('exposes auth routes, guards, and usecases', () => {
    const module = makeAuthModule({
      db: {} as Database,
      tokenSecret: 'test-token-secret',
      sessionTtlMinutes: 30,
      sessionIdleTimeoutMinutes: 30,
      loginWindowMinutes: 15,
      loginMaxFailures: 5,
      mfaChallengeTtlMinutes: 5,
      mfaEncryptionKey: Buffer.alloc(32).toString('base64'),
      mfaIssuer: 'Pressly Test',
    });

    expect(module.routes).toBeDefined();
    expect(module.guards).toEqual({
      authenticate: expect.any(Function),
      authorize: expect.any(Function),
    });
    expect(module.usecases).toEqual({
      login: expect.any(Function),
      loadSession: expect.any(Function),
      revokeSession: expect.any(Function),
      listIdentitySessions: expect.any(Function),
      revokeIdentitySessions: expect.any(Function),
      completeMfaChallenge: expect.any(Function),
      beginMfaEnrollment: expect.any(Function),
      confirmMfaEnrollment: expect.any(Function),
      regenerateMfaRecoveryCodes: expect.any(Function),
      removeMfa: expect.any(Function),
    });
  });
});
