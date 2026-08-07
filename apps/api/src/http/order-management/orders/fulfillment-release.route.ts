import {
  canonicalFulfillmentParamsSchema,
  orderMutationResultSchema,
  releaseFulfillmentRequestSchema,
  withdrawFulfillmentRequestSchema,
} from '@pressly/contracts/orders';
import { apiSuccess } from '@pressly/http';
import { defineValidatedController } from '@pressly/http/express';
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
  const releaseController = defineValidatedController({
    request: {
      params: canonicalFulfillmentParamsSchema,
      body: releaseFulfillmentRequestSchema,
    },
    handle: async ({ params, body }, { response }) => {
      const outcome = await input.orders.releaseFulfillment({
        ...body,
        businessId: await input.resolveBusinessId(params.locationId),
        context: orderManagementCommandContext(response, input.readPrincipal),
        fulfillmentId: params.fulfillmentId,
        locationId: params.locationId,
      });
      const value = orderManagementResultValue(outcome);
      response.json(apiSuccess(orderMutationResultSchema.parse(value)));
    },
  });
  const withdrawController = defineValidatedController({
    request: {
      params: canonicalFulfillmentParamsSchema,
      body: withdrawFulfillmentRequestSchema,
    },
    handle: async ({ params, body }, { response }) => {
      const outcome = await input.orders.withdrawFulfillment({
        ...body,
        businessId: await input.resolveBusinessId(params.locationId),
        context: orderManagementCommandContext(response, input.readPrincipal),
        fulfillmentId: params.fulfillmentId,
        locationId: params.locationId,
      });
      const value = orderManagementResultValue(outcome);
      response.json(apiSuccess(orderMutationResultSchema.parse(value)));
    },
  });

  routes.post(
    '/order-management/locations/:locationId/fulfillments/:fulfillmentId/release',
    input.authenticate,
    releaseController.validators.params,
    input.authorize,
    releaseController.validators.body,
    releaseController.handle,
  );

  routes.post(
    '/order-management/locations/:locationId/fulfillments/:fulfillmentId/withdraw',
    input.authenticate,
    withdrawController.validators.params,
    input.authorize,
    withdrawController.validators.body,
    withdrawController.handle,
  );

  return routes;
};
