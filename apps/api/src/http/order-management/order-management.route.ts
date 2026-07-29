import type { OrdersApplication } from '@pressly/orders';
import type { UsersApplication } from '@pressly/users';
import { Router, type RequestHandler } from 'express';
import type { ReadOrderManagementPrincipal } from './command-context.mapper.ts';
import { makeOrderCommandRoutes } from './orders/order-command.route.ts';
import { makeFulfillmentReleaseRoutes } from './orders/fulfillment-release.route.ts';
import { makeIncomingOrderProposalRoutes } from './orders/incoming-order-proposal.route.ts';
import { makeOrderLifecycleRoutes } from './orders/order-lifecycle.route.ts';
import { makeUserCommandRoutes } from './users/user-command.route.ts';

export const makeOrderManagementRoutes = (input: {
  users: Pick<UsersApplication, 'createUser' | 'updateUser'>;
  orders: Pick<
    OrdersApplication,
    | 'createOrder'
    | 'correctOrder'
    | 'completeOrder'
    | 'cancelOrder'
    | 'releaseFulfillment'
    | 'withdrawFulfillment'
    | 'listIncomingOrderProposals'
    | 'acceptIncomingOrderProposal'
    | 'rejectIncomingOrderProposal'
    | 'restoreIncomingOrderProposal'
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
    makeIncomingOrderProposalRoutes({
      orders: input.orders,
      authenticate: input.authenticate,
      authorize: input.authorizeOrders,
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
    makeOrderLifecycleRoutes({
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
