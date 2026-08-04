import {
  canonicalFulfillmentParamsSchema,
  orderMutationResultSchema,
  releaseFulfillmentRequestSchema,
  withdrawFulfillmentRequestSchema,
} from '@pressly/contracts/orders';
import { apiSuccess } from '@pressly/http';
import { catchAsync, validateRequest } from '@pressly/http/express';
import type { OrdersApplication } from '@pressly/orders';
import type { LocationAncestryPort } from '@pressly/authorization';
import { Router, type RequestHandler } from 'express';
import {
  orderManagementCommandContext,
  type ReadOrderManagementPrincipal,
} from '../command-context.adapter.ts';
import { orderManagementResultValue } from './order-management.error.ts';

export const makeFulfillmentReleaseRoutes = (input: {
  orders: Pick<OrdersApplication, 'releaseFulfillment' | 'withdrawFulfillment'>;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readPrincipal: ReadOrderManagementPrincipal;
  resolveBusinessId: LocationAncestryPort['resolveBusinessId'];
}): Router => {
  const routes = Router();

  const security = [
    input.authenticate,
    validateRequest({ params: canonicalFulfillmentParamsSchema }),
    input.authorize,
  ] as const;

  routes.post(
    '/order-management/locations/:locationId/fulfillments/:fulfillmentId/release',
    ...security,
    validateRequest({ body: releaseFulfillmentRequestSchema }),
    catchAsync(async (request, response) => {
      const outcome = await input.orders.releaseFulfillment({
        ...request.body,
        businessId: await input.resolveBusinessId(
          request.params['locationId'] as string,
        ),
        context: orderManagementCommandContext(response, input.readPrincipal),
        fulfillmentId: request.params['fulfillmentId'] as string,
        locationId: request.params['locationId'] as string,
      });
      const value = orderManagementResultValue(outcome);
      response.json(apiSuccess(orderMutationResultSchema.parse(value)));
    }),
  );

  routes.post(
    '/order-management/locations/:locationId/fulfillments/:fulfillmentId/withdraw',
    ...security,
    validateRequest({ body: withdrawFulfillmentRequestSchema }),
    catchAsync(async (request, response) => {
      const outcome = await input.orders.withdrawFulfillment({
        ...request.body,
        businessId: await input.resolveBusinessId(
          request.params['locationId'] as string,
        ),
        context: orderManagementCommandContext(response, input.readPrincipal),
        fulfillmentId: request.params['fulfillmentId'] as string,
        locationId: request.params['locationId'] as string,
      });
      const value = orderManagementResultValue(outcome);
      response.json(apiSuccess(orderMutationResultSchema.parse(value)));
    }),
  );

  return routes;
};
