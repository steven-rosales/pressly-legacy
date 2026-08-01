import type { Request, RequestHandler } from 'express';
import type { AccessControlAuthPort } from '../http/auth.port.ts';
import type { LocationAncestryPort } from '../identity/location-ancestry.port.ts';
import { makeOrderManagementPolicies } from './order-management.policy.ts';
import {
  orderManagementLocationResource,
  orderManagementUsersResource,
} from './order-management.resource.ts';

export type OrderManagementAccessControl = Readonly<{
  writeUsers: RequestHandler;
  writeOrders: RequestHandler;
}>;

const readLocationId = (request: Request): string => {
  const locationId = request.params['locationId'];
  if (typeof locationId !== 'string' || locationId.length === 0)
    throw Object.assign(new Error('Order location is required.'), {
      code: 'order_location_required',
    });
  return locationId;
};

export const makeOrderManagementAccessControl = (input: {
  auth: AccessControlAuthPort;
  locationAncestry: LocationAncestryPort;
}): OrderManagementAccessControl => {
  const policies = makeOrderManagementPolicies();
  const readLocationResource = async (request: Request) => {
    const locationId = readLocationId(request);
    const businessId =
      await input.locationAncestry.resolveBusinessId(locationId);
    return orderManagementLocationResource(locationId, businessId);
  };
  return {
    writeUsers: input.auth.authorize({
      action: 'order-management:user:write',
      policies,
      readResource: orderManagementUsersResource,
    }),
    writeOrders: input.auth.authorize({
      action: 'order-management:order:write',
      policies,
      readResource: readLocationResource,
    }),
  };
};
