import type { RequestHandler } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { makeAccessControlModule } from '../src/main.ts';
import type { AccessControlAuthorize } from '../src/guards/pricing.guards.ts';

describe('access-control module composition', () => {
  it('exposes pricing access-control guards', () => {
    const authorize: AccessControlAuthorize = () =>
      vi.fn() as unknown as RequestHandler;

    const module = makeAccessControlModule({
      auth: {
        authenticate: vi.fn() as unknown as RequestHandler,
        authorize,
      },
      policies: {
        pricing: {
          freshSessionMaxAgeMinutes: 15,
        },
        authSessions: {
          freshSessionMaxAgeMinutes: 15,
        },
        mfa: {
          freshSessionMaxAgeMinutes: 15,
        },
      },
    });

    expect(module.pricing).toEqual({
      authenticate: expect.any(Function),
      planPricingChange: expect.any(Function),
      publishPricingChange: expect.any(Function),
      readAuthor: expect.any(Function),
    });
    expect(module.authSessions).toEqual({
      authenticate: expect.any(Function),
      readSessions: expect.any(Function),
      revokeSessions: expect.any(Function),
      readPrincipalIdentityId: expect.any(Function),
    });
    expect(module.mfa).toEqual({
      authenticate: expect.any(Function),
      enroll: expect.any(Function),
      manage: expect.any(Function),
    });
  });
});
