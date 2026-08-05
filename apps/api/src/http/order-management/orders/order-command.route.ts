import {
  canonicalOrderParamsSchema,
  correctOrderRequestSchema,
  createOrderRequestSchema,
  orderMutationResultSchema,
} from '@pressly/contracts/orders';
import { productionLocationParamsSchema } from '@pressly/contracts/production';
import { validationError } from '@pressly/errors/factories';
import { apiSuccess } from '@pressly/http';
import { defineValidatedController } from '@pressly/http/express';
import type { OrderCustomer, OrdersApplication } from '@pressly/orders';
import type { LocationAncestryPort } from '@pressly/authorization';
import { Router, type RequestHandler } from 'express';
import {
  orderManagementCommandContext,
  type ReadOrderManagementPrincipal,
} from '../command-context.adapter.ts';
import { orderManagementResultValue } from './order-management.error.ts';

const directCustomer = (
  input:
    | Readonly<{ resolution: 'resolved'; userId: string }>
    | Readonly<{ resolution: 'not_provided'; userId: null }>,
): OrderCustomer =>
  input.resolution === 'resolved'
    ? {
        resolution: 'resolved',
        userId: input.userId,
        externalUserId: null,
      }
    : {
        resolution: 'not_provided',
        userId: null,
        externalUserId: null,
      };

export const makeOrderCommandRoutes = (input: {
  orders: Pick<OrdersApplication, 'createOrder' | 'correctOrder'>;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readPrincipal: ReadOrderManagementPrincipal;
  resolveBusinessId: LocationAncestryPort['resolveBusinessId'];
}): Router => {
  const routes = Router();
  const createController = defineValidatedController({
    request: {
      params: productionLocationParamsSchema,
      body: createOrderRequestSchema,
    },
    handle: async ({ params, body }, { response }) => {
      if (body.fulfillment.locationId !== params.locationId)
        throw validationError({
          code: 'order_location_mismatch',
          message: 'The Order fulfillment location does not match the route.',
          safeMessage: 'The order location does not match this location.',
          status: 422,
        });
      const outcome = await input.orders.createOrder({
        ...body,
        businessId: await input.resolveBusinessId(params.locationId),
        context: orderManagementCommandContext(response, input.readPrincipal),
        customer: directCustomer(body.customer),
        dueAt: new Date(body.dueAt),
      });
      const value = orderManagementResultValue(outcome);
      response
        .status(201)
        .json(apiSuccess(orderMutationResultSchema.parse(value)));
    },
  });
  const correctController = defineValidatedController({
    request: {
      params: canonicalOrderParamsSchema,
      body: correctOrderRequestSchema,
    },
    handle: async ({ params, body }, { response }) => {
      const outcome = await input.orders.correctOrder({
        businessId: await input.resolveBusinessId(params.locationId),
        idempotencyKey: body.idempotencyKey,
        context: orderManagementCommandContext(response, input.readPrincipal),
        reasonCode: body.reasonCode,
        reasonNote: body.reasonNote,
        expectedOrderVersion: body.expectedOrderVersion,
        expectedFulfillmentVersion: body.expectedFulfillmentVersion,
        locationId: params.locationId,
        orderId: params.orderId,
        changes: {
          ...(body.changes.customer === undefined
            ? {}
            : { customer: directCustomer(body.changes.customer) }),
          ...(body.changes.displayNumber === undefined
            ? {}
            : { displayNumber: body.changes.displayNumber }),
          ...(body.changes.dueAt === undefined
            ? {}
            : { dueAt: new Date(body.changes.dueAt) }),
          ...(body.changes.currency === undefined
            ? {}
            : { currency: body.changes.currency }),
          ...(body.changes.totalAmountCents === undefined
            ? {}
            : { totalAmountCents: body.changes.totalAmountCents }),
          ...(body.changes.balanceDueCents === undefined
            ? {}
            : { balanceDueCents: body.changes.balanceDueCents }),
          ...(body.changes.items === undefined
            ? {}
            : { items: body.changes.items }),
          ...(body.changes.fulfillment === undefined
            ? {}
            : {
                fulfillment: {
                  ...(body.changes.fulfillment.typeCode === undefined
                    ? {}
                    : { typeCode: body.changes.fulfillment.typeCode }),
                  ...(body.changes.fulfillment.locationId === undefined
                    ? {}
                    : { locationId: body.changes.fulfillment.locationId }),
                  ...(body.changes.fulfillment.estimatedWeight === undefined
                    ? {}
                    : {
                        estimatedWeight:
                          body.changes.fulfillment.estimatedWeight,
                      }),
                },
              }),
        },
      });
      const value = orderManagementResultValue(outcome);
      response.json(apiSuccess(orderMutationResultSchema.parse(value)));
    },
  });

  routes.post(
    '/order-management/locations/:locationId/orders',
    input.authenticate,
    createController.validators.params,
    input.authorize,
    createController.validators.body,
    createController.handle,
  );
  routes.patch(
    '/order-management/locations/:locationId/orders/:orderId',
    input.authenticate,
    correctController.validators.params,
    input.authorize,
    correctController.validators.body,
    correctController.handle,
  );

  return routes;
};
