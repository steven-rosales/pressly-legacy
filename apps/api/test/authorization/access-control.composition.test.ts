import type { Principal } from '@pressly/auth/authentication';
import type {
  Action,
  AuthResource,
  PolicyRule,
  PrincipalAttributes,
} from '@pressly/auth/authorization';
import { businessScope, locationScope } from '@pressly/auth/authorization';
import { makeAuthorizationModule } from '@pressly/authorization';
import type { Request, RequestHandler, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import {
  makeApiAccessControl,
  type ApiAuthorize,
} from '../../src/http/authorization/access-control.composition.ts';

const principal: Principal = {
  identityId: '11111111-1111-4111-8111-111111111111',
  kind: 'human',
  displayName: 'Pressly Operator',
};

type RecordedAuthorization = Readonly<{
  action: Action;
  policies: readonly PolicyRule<AuthResource>[];
  readResource: (
    request: Request,
    response: Response,
  ) => AuthResource | Promise<AuthResource>;
}>;

const setup = (principalAttributes?: PrincipalAttributes) => {
  const calls: RecordedAuthorization[] = [];
  const handler = vi.fn() as unknown as RequestHandler;
  const authorize: ApiAuthorize = <Resource extends AuthResource>(input: {
    action: Action;
    policies: readonly PolicyRule<Resource>[];
    readResource: (
      request: Request,
      response: Response,
    ) => Resource | Promise<Resource>;
  }) => {
    calls.push(input as RecordedAuthorization);
    return handler;
  };
  const resolveBusinessId = vi.fn(async () => 'canonical-business');
  const listLocationIdsForBusinesses = vi.fn(async () => ['derived-location']);
  const authorization = makeAuthorizationModule({
    locationAncestry: {
      resolveBusinessId,
      listLocationIdsForBusinesses,
    },
    clock: { now: () => new Date('2026-08-03T12:00:00.000Z') },
    policies: {
      pricing: { freshSessionMaxAgeMinutes: 15 },
      authSessions: { freshSessionMaxAgeMinutes: 15 },
      mfa: { freshSessionMaxAgeMinutes: 15 },
    },
  });
  const access = makeApiAccessControl({
    authorization,
    auth: {
      authenticate: handler,
      authorize,
      readPrincipal: () => principal,
      ...(principalAttributes === undefined
        ? {}
        : { readPrincipalAttributes: () => principalAttributes }),
    },
  });

  return {
    access,
    calls,
    resolveBusinessId,
    listLocationIdsForBusinesses,
  } as const;
};

describe('API authorization adapter', () => {
  it('derives canonical location ancestry from route parameters only', async () => {
    const fixture = setup();
    const call = fixture.calls.find(
      (candidate) => candidate.action === 'production:read',
    );
    expect(call).toBeDefined();

    await expect(
      call?.readResource(
        {
          params: { locationId: 'route-location' },
          body: { locationId: 'spoofed-location' },
        } as unknown as Request,
        {} as Response,
      ),
    ).resolves.toEqual({
      kind: 'production.location',
      id: 'production:route-location',
      scope: locationScope('route-location'),
      ancestorScopes: [businessScope('canonical-business')],
      attributes: {
        locationId: 'route-location',
        businessId: 'canonical-business',
      },
    });
    expect(fixture.resolveBusinessId).toHaveBeenCalledWith('route-location');
  });

  it('keeps missing route locations as safe validation errors', async () => {
    const fixture = setup();
    const call = fixture.calls.find(
      (candidate) => candidate.action === 'order-management:order:write',
    );

    await expect(
      call?.readResource({ params: {} } as Request, {} as Response),
    ).rejects.toMatchObject({
      tag: 'AppError',
      code: 'order_location_required',
      status: 400,
    });
  });

  it('adapts trusted principals without moving identity policy into HTTP', () => {
    const fixture = setup();
    expect(fixture.access.pricing.readAuthor({} as Response)).toEqual({
      id: principal.identityId,
      kind: principal.kind,
      displayName: principal.displayName,
    });
    expect(fixture.access.production.readActorId({} as Response)).toBe(
      principal.identityId,
    );
  });

  it('delegates location visibility to the framework-free module query', async () => {
    const fixture = setup({
      identityActive: true,
      assignments: [
        { role: 'operator', scope: locationScope('direct-location') },
        { role: 'manager', scope: businessScope('business-1') },
      ],
    });

    await expect(
      fixture.access.production.readAllowedLocationIds({} as Response),
    ).resolves.toEqual(['derived-location', 'direct-location']);
    expect(fixture.listLocationIdsForBusinesses).toHaveBeenCalledWith([
      'business-1',
    ]);
  });
});
