import type { OrdersApplication } from '@pressly/orders';
import type { LocationAncestryPort } from '@pressly/authorization';
import { Router, type RequestHandler } from 'express';
import type { ReadOrderManagementPrincipal } from './command-context.adapter.ts';
import { makeOrderCommandRoutes } from './orders/order-command.route.ts';
import { makeFulfillmentReleaseRoutes } from './orders/fulfillment-release.route.ts';
import { makeIncomingOrderProposalRoutes } from './orders/incoming-order-proposal.route.ts';
import { makeOrderLifecycleRoutes } from './orders/order-lifecycle.route.ts';

export const makeOrderManagementRoutes = (input: {
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
  authorizeOrders: RequestHandler;
  readPrincipal: ReadOrderManagementPrincipal;
  resolveBusinessId: LocationAncestryPort['resolveBusinessId'];
}): Router => {
  const routes = Router();
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
      resolveBusinessId: input.resolveBusinessId,
    }),
  );
  routes.use(
    makeOrderLifecycleRoutes({
      orders: input.orders,
      authenticate: input.authenticate,
      authorize: input.authorizeOrders,
      readPrincipal: input.readPrincipal,
      resolveBusinessId: input.resolveBusinessId,
    }),
  );
  routes.use(
    makeFulfillmentReleaseRoutes({
      orders: input.orders,
      authenticate: input.authenticate,
      authorize: input.authorizeOrders,
      readPrincipal: input.readPrincipal,
      resolveBusinessId: input.resolveBusinessId,
    }),
  );
  return routes;
};
