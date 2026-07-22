import type { Request, RequestHandler } from 'express';
import type { AccessControlAuthPort } from '../auth.port.ts';
import { makeOrderManagementPolicies } from './order-management.policy.ts';
import {
  orderManagementLocationResource,
  orderManagementUsersResource,
} from './order-management.resource.ts';

export type OrderManagementAccessControl = Readonly<{
  writeUsers: RequestHandler;
  writeOrders: RequestHandler;
}>;

const readLocationResource = (request: Request) => {
  const locationId = request.params['locationId'];
  if (typeof locationId !== 'string' || locationId.length === 0)
    throw Object.assign(new Error('Order location is required.'), {
      code: 'order_location_required',
    });
  return orderManagementLocationResource(locationId);
};

export const makeOrderManagementAccessControl = (input: {
  auth: AccessControlAuthPort;
}): OrderManagementAccessControl => {
  const policies = makeOrderManagementPolicies();
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
