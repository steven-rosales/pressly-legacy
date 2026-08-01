import type { Principal } from '@pressly/auth/authentication';
import {
  authorize,
  businessScope,
  globalScope,
  locationScope,
  type Action,
  type AuthResource,
  type PolicyRule,
  type PrincipalAttributes,
} from '@pressly/auth/authorization';
import type { Request, RequestHandler, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { AccessControlAuthorize } from '../../src/auth.port.ts';
import { makeProductionAccessControl } from '../../src/production/production.guard.ts';

const principal: Principal = {
  identityId: '11111111-1111-4111-8111-111111111111',
  kind: 'human',
  displayName: 'Production manager',
};

type RecordedAuthorizeInput = Readonly<{
  action: Action;
  policies: readonly PolicyRule<AuthResource>[];
  readResource: (
    request: Request,
    response: Response,
  ) => AuthResource | Promise<AuthResource>;
}>;

const makeAuthorizeRecorder = () => {
  const calls: RecordedAuthorizeInput[] = [];
  const handler = vi.fn() as unknown as RequestHandler;
  const authorize: AccessControlAuthorize = <R extends AuthResource>(input: {
    action: Action;
    policies: readonly PolicyRule<R>[];
    readResource: (request: Request, response: Response) => R | Promise<R>;
  }) => {
    calls.push(input as RecordedAuthorizeInput);
    return handler;
  };

  return { authorize, calls, handler } as const;
};

const request = (locationId: string, bodyLocationId = 'spoofed-location') =>
  ({
    params: { locationId },
    body: { locationId: bodyLocationId },
  }) as unknown as Request;

describe('production access-control guard', () => {
  it('awaits canonical ancestry and ignores body-provided location claims', async () => {
    const recorder = makeAuthorizeRecorder();
    let resolveBusiness: ((businessId: string) => void) | undefined;
    const resolveBusinessId = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveBusiness = resolve;
        }),
    );
    const accessControl = makeProductionAccessControl({
      auth: {
        authenticate: vi.fn() as unknown as RequestHandler,
        authorize: recorder.authorize,
        readPrincipal: vi.fn(() => principal),
      },
      locationAncestry: {
        resolveBusinessId,
        listLocationIdsForBusinesses: vi.fn(async () => []),
      },
    });
    const readCall = recorder.calls.find(
      (call) => call.action === 'production:read',
    );
    if (readCall === undefined)
      throw new Error('Production read guard missing.');

    const pendingResource = readCall.readResource(request('route-location'), {
      locals: {},
    } as Response);
    let settled = false;
    void Promise.resolve(pendingResource).then(() => {
      settled = true;
    });
    await Promise.resolve();

    expect(settled).toBe(false);
    expect(resolveBusinessId).toHaveBeenCalledWith('route-location');

    resolveBusiness?.('canonical-business');
    await expect(pendingResource).resolves.toEqual({
      kind: 'production.location',
      id: 'production:route-location',
      scope: locationScope('route-location'),
      ancestorScopes: [businessScope('canonical-business')],
      attributes: {
        locationId: 'route-location',
        businessId: 'canonical-business',
      },
    });
    expect(accessControl.read).toBe(recorder.handler);
  });

  it('denies a business assignment outside canonical location ancestry', async () => {
    const recorder = makeAuthorizeRecorder();
    makeProductionAccessControl({
      auth: {
        authenticate: vi.fn() as unknown as RequestHandler,
        authorize: recorder.authorize,
        readPrincipal: vi.fn(() => principal),
      },
      locationAncestry: {
        resolveBusinessId: vi.fn(async () => 'canonical-business'),
        listLocationIdsForBusinesses: vi.fn(async () => []),
      },
    });
    const readCall = recorder.calls.find(
      (call) => call.action === 'production:read',
    );
    if (readCall === undefined)
      throw new Error('Production read guard missing.');
    const resource = await readCall.readResource(
      request('route-location', 'assigned-business-location'),
      { locals: {} } as Response,
    );

    expect(
      authorize({
        principal,
        principalAttributes: {
          assignments: [
            { role: 'manager', scope: businessScope('other-business') },
          ],
          identityActive: true,
          assuranceLevel: 'mfa',
        },
        action: readCall.action,
        resource,
        environment: { now: new Date('2026-07-31T20:00:00.000Z') },
        policies: readCall.policies,
      }),
    ).toMatchObject({ tag: 'denied', reason: 'missing_assignment' });
  });

  it('unions direct and business-derived location visibility', async () => {
    const recorder = makeAuthorizeRecorder();
    const listLocationIdsForBusinesses = vi.fn(async () => [
      'derived-location',
      'direct-location',
    ]);
    const accessControl = makeProductionAccessControl({
      auth: {
        authenticate: vi.fn() as unknown as RequestHandler,
        authorize: recorder.authorize,
        readPrincipal: vi.fn(() => principal),
        readPrincipalAttributes: vi.fn(
          () =>
            ({
              assignments: [
                { role: 'operator', scope: locationScope('direct-location') },
                { role: 'manager', scope: businessScope('business-b') },
                { role: 'owner', scope: businessScope('business-a') },
                {
                  role: 'customer',
                  scope: locationScope('customer-location'),
                },
              ],
              identityActive: true,
              assuranceLevel: 'mfa',
            }) satisfies PrincipalAttributes,
        ),
      },
      locationAncestry: {
        resolveBusinessId: vi.fn(async () => 'business-a'),
        listLocationIdsForBusinesses,
      },
    });

    await expect(
      accessControl.readAllowedLocationIds({ locals: {} } as Response),
    ).resolves.toEqual(['derived-location', 'direct-location']);
    expect(listLocationIdsForBusinesses).toHaveBeenCalledWith([
      'business-b',
      'business-a',
    ]);
  });

  it('preserves global visibility as null without ancestry expansion', async () => {
    const recorder = makeAuthorizeRecorder();
    const listLocationIdsForBusinesses = vi.fn(async () => ['unexpected']);
    const accessControl = makeProductionAccessControl({
      auth: {
        authenticate: vi.fn() as unknown as RequestHandler,
        authorize: recorder.authorize,
        readPrincipal: vi.fn(() => principal),
        readPrincipalAttributes: vi.fn(
          () =>
            ({
              assignments: [
                { role: 'admin', scope: globalScope() },
                { role: 'manager', scope: businessScope('business-a') },
              ],
              identityActive: true,
              assuranceLevel: 'mfa',
            }) satisfies PrincipalAttributes,
        ),
      },
      locationAncestry: {
        resolveBusinessId: vi.fn(async () => 'business-a'),
        listLocationIdsForBusinesses,
      },
    });

    await expect(
      accessControl.readAllowedLocationIds({ locals: {} } as Response),
    ).resolves.toBeNull();
    expect(listLocationIdsForBusinesses).not.toHaveBeenCalled();
  });
});
