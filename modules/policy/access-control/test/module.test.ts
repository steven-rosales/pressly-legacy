import type { RequestHandler } from 'express';
import type { Principal } from '@pressly/auth/authentication';
import { describe, expect, it, vi } from 'vitest';
import {
  makeAccessControlModule,
  type AccessControlModuleDeps,
} from '../src/public.ts';

describe('access-control module composition', () => {
  it('exposes pricing access-control guards', () => {
    const authorize: AccessControlModuleDeps['auth']['authorize'] = () =>
      vi.fn() as unknown as RequestHandler;

    const module = makeAccessControlModule({
      auth: {
        authenticate: vi.fn() as unknown as RequestHandler,
        authorize,
        readPrincipal: vi.fn(
          () =>
            ({
              identityId: '11111111-1111-4111-8111-111111111111',
              kind: 'human',
              displayName: 'Admin User',
            }) satisfies Principal,
        ),
      },
      locationAncestry: {
        resolveBusinessId: vi.fn(async () => 'business-1'),
        listLocationIdsForBusinesses: vi.fn(async () => ['location-1']),
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
    expect(module.orderManagement).toEqual({
      writeUsers: expect.any(Function),
      writeOrders: expect.any(Function),
    });
    expect(module.production).toEqual({
      authenticate: expect.any(Function),
      read: expect.any(Function),
      schedule: expect.any(Function),
      accept: expect.any(Function),
      start: expect.any(Function),
      queue: expect.any(Function),
      override: expect.any(Function),
      priority: expect.any(Function),
      intake: expect.any(Function),
      admission: expect.any(Function),
      resources: expect.any(Function),
      stage: expect.any(Function),
      readActorId: expect.any(Function),
      readAllowedLocationIds: expect.any(Function),
    });
  });
});
