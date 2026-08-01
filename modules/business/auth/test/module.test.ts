import { describe, expect, it } from 'vitest';
import type { Database } from '@pressly/db';
import { makeAuthModule } from '../src/public.ts';

describe('auth module composition', () => {
  it('exposes auth routes, guards, and protected route composition', () => {
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
      readPrincipal: expect.any(Function),
      readPrincipalAttributes: expect.any(Function),
    });
    expect(module.makeAdministrationRoutes).toEqual(expect.any(Function));
    expect(module.application).toEqual({
      login: expect.any(Function),
      loadSession: expect.any(Function),
      revokeSession: expect.any(Function),
      completeMfaChallenge: expect.any(Function),
      workforce: {
        issueInvitation: expect.any(Function),
        reissueInvitation: expect.any(Function),
        revokeInvitation: expect.any(Function),
        previewInvitation: expect.any(Function),
        acceptInvitation: expect.any(Function),
        listInvitations: expect.any(Function),
        listWorkforce: expect.any(Function),
        getWorkforceMember: expect.any(Function),
        listMemberSessions: expect.any(Function),
        revokeMemberSessions: expect.any(Function),
        listSecurityEvents: expect.any(Function),
        suspendMembership: expect.any(Function),
        reactivateMembership: expect.any(Function),
        endMembership: expect.any(Function),
        grantAccess: expect.any(Function),
        revokeAccess: expect.any(Function),
      },
    });
    expect(Object.keys(module)).toEqual([
      'routes',
      'guards',
      'application',
      'makeAdministrationRoutes',
    ]);
  });
});
