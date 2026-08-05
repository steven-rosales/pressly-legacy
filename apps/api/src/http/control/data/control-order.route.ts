import {
  controlOrderDetailSchema,
  controlOrderListQuerySchema,
  controlOrderListSchema,
  controlCorrectOrderRequestSchema,
  controlCreateOrderRequestSchema,
  orderMutationResultSchema,
} from '@pressly/contracts/orders';
import type { ControlExperience } from '@pressly/control-experience';
import { apiSuccess } from '@pressly/http';
import { defineValidatedController } from '@pressly/http/express';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { controlResultValue } from '../control-experience.error.ts';
import { readControlRequestContext } from '../control-request-context.adapter.ts';

const orderParamsSchema = z.object({ orderId: z.uuid() }).strict();

export const makeControlOrderRoutes = (input: {
  application: ControlExperience['orders'];
  authenticate: RequestHandler;
  limitIdentity: RequestHandler;
  requireRead: RequestHandler;
  requireWrite: RequestHandler;
}): Router => {
  const routes = Router();
  const read = [
    input.authenticate,
    input.limitIdentity,
    input.requireRead,
  ] as const;
  const write = [
    input.authenticate,
    input.limitIdentity,
    input.requireWrite,
  ] as const;
  const listController = defineValidatedController({
    request: { query: controlOrderListQuerySchema },
    handle: async ({ query }, { response }) => {
      const page = controlResultValue(
        await input.application.list({
          context: readControlRequestContext(response),
          ...(query.query === undefined ? {} : { query: query.query }),
          ...(query.state === undefined ? {} : { state: query.state }),
          ...(query.locationId === undefined
            ? {}
            : { locationId: query.locationId }),
          limit: query.limit,
          ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
        }),
      );
      response.json(
        apiSuccess(
          controlOrderListSchema.parse({
            items: page.items,
            nextCursor: page.nextCursor,
          }),
        ),
      );
    },
  });
  const getController = defineValidatedController({
    request: { params: orderParamsSchema },
    handle: async ({ params }, { response }) => {
      const order = controlResultValue(
        await input.application.get({
          context: readControlRequestContext(response),
          orderId: params.orderId,
        }),
      );
      response.json(apiSuccess(controlOrderDetailSchema.parse(order)));
    },
  });
  const createController = defineValidatedController({
    request: { body: controlCreateOrderRequestSchema },
    handle: async ({ body }, { response }) => {
      const outcome = controlResultValue(
        await input.application.create({
          ...body,
          context: readControlRequestContext(response),
        }),
      );
      response
        .status(201)
        .json(apiSuccess(orderMutationResultSchema.parse(outcome)));
    },
  });
  const correctController = defineValidatedController({
    request: {
      params: orderParamsSchema,
      body: controlCorrectOrderRequestSchema,
    },
    handle: async ({ params, body }, { response }) => {
      const outcome = controlResultValue(
        await input.application.correct({
          orderId: params.orderId,
          idempotencyKey: body.idempotencyKey,
          context: readControlRequestContext(response),
          reasonCode: body.reasonCode,
          reasonNote: body.reasonNote,
          expectedOrderVersion: body.expectedOrderVersion,
          expectedFulfillmentVersion: body.expectedFulfillmentVersion,
          changes: {
            ...(body.changes.customer === undefined
              ? {}
              : { customer: body.changes.customer }),
            ...(body.changes.displayNumber === undefined
              ? {}
              : { displayNumber: body.changes.displayNumber }),
            ...(body.changes.dueAt === undefined
              ? {}
              : { dueAt: body.changes.dueAt }),
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
        }),
      );
      response.json(apiSuccess(orderMutationResultSchema.parse(outcome)));
    },
  });

  routes.get(
    '/orders',
    ...read,
    listController.validate,
    listController.handle,
  );

  routes.get(
    '/orders/:orderId',
    ...read,
    getController.validate,
    getController.handle,
  );

  routes.post(
    '/orders',
    ...write,
    createController.validate,
    createController.handle,
  );

  routes.patch(
    '/orders/:orderId',
    ...write,
    correctController.validate,
    correctController.handle,
  );

  return routes;
};
