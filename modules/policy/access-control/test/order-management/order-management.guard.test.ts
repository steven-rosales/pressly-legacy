import type { Principal } from '@pressly/auth/authentication';
import {
  businessScope,
  locationScope,
  type Action,
  type AuthResource,
  type PolicyRule,
} from '@pressly/auth/authorization';
import type { Request, RequestHandler, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { AccessControlAuthorize } from '../../src/http/auth.port.ts';
import { makeOrderManagementAccessControl } from '../../src/order-management/order-management.guard.ts';

const principal: Principal = {
  identityId: '11111111-1111-4111-8111-111111111111',
  kind: 'human',
  displayName: 'Order owner',
};

type RecordedAuthorizeInput = Readonly<{
  action: Action;
  policies: readonly PolicyRule<AuthResource>[];
  readResource: (
    request: Request,
    response: Response,
  ) => AuthResource | Promise<AuthResource>;
}>;

describe('order-management access-control guard', () => {
  it('derives location ancestry canonically from the route, not request data', async () => {
    const calls: RecordedAuthorizeInput[] = [];
    const resolveBusinessId = vi.fn(async () => 'canonical-business');
    const authorize: AccessControlAuthorize = <R extends AuthResource>(input: {
      action: Action;
      policies: readonly PolicyRule<R>[];
      readResource: (request: Request, response: Response) => R | Promise<R>;
    }) => {
      calls.push(input as RecordedAuthorizeInput);
      return vi.fn() as unknown as RequestHandler;
    };

    makeOrderManagementAccessControl({
      auth: {
        authenticate: vi.fn() as unknown as RequestHandler,
        authorize,
        readPrincipal: vi.fn(() => principal),
      },
      locationAncestry: {
        resolveBusinessId,
        listLocationIdsForBusinesses: vi.fn(async () => []),
      },
    });
    const orderCall = calls.find(
      (call) => call.action === 'order-management:order:write',
    );
    if (orderCall === undefined)
      throw new Error('Order-management write guard missing.');

    await expect(
      orderCall.readResource(
        {
          params: { locationId: 'route-location' },
          body: {
            locationId: 'spoofed-location',
            fulfillment: { locationId: 'spoofed-location' },
          },
        } as unknown as Request,
        { locals: {} } as Response,
      ),
    ).resolves.toEqual({
      kind: 'order-management.location',
      id: 'order-management:route-location',
      scope: locationScope('route-location'),
      ancestorScopes: [businessScope('canonical-business')],
      attributes: {
        locationId: 'route-location',
        businessId: 'canonical-business',
      },
    });
    expect(resolveBusinessId).toHaveBeenCalledWith('route-location');
  });
});
