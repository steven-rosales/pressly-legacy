import type { OrdersApplication } from '@pressly/orders';
import type { UsersApplication } from '@pressly/users';
import { Router, type RequestHandler } from 'express';
import type { ReadOrderManagementPrincipal } from './command-context.mapper.ts';
import { makeOrderCommandRoutes } from './orders/order-command.route.ts';
import { makeFulfillmentReleaseRoutes } from './orders/fulfillment-release.route.ts';
import { makeUserCommandRoutes } from './users/user-command.route.ts';

export const makeOrderManagementRoutes = (input: {
  users: Pick<UsersApplication, 'createUser' | 'updateUser'>;
  orders: Pick<
    OrdersApplication,
    'createOrder' | 'updateOrder' | 'changeFulfillmentRelease'
  >;
  authenticate: RequestHandler;
  authorizeUsers: RequestHandler;
  authorizeOrders: RequestHandler;
  readPrincipal: ReadOrderManagementPrincipal;
}): Router => {
  const routes = Router();
  routes.use(
    makeUserCommandRoutes({
      users: input.users,
      authenticate: input.authenticate,
      authorize: input.authorizeUsers,
      readPrincipal: input.readPrincipal,
    }),
  );
  routes.use(
    makeOrderCommandRoutes({
      orders: input.orders,
      authenticate: input.authenticate,
      authorize: input.authorizeOrders,
      readPrincipal: input.readPrincipal,
    }),
  );
  routes.use(
    makeFulfillmentReleaseRoutes({
      orders: input.orders,
      authenticate: input.authenticate,
      authorize: input.authorizeOrders,
      readPrincipal: input.readPrincipal,
    }),
  );
  return routes;
};
