import {
  canonicalUserParamsSchema,
  controlCustomerListQuerySchema,
  controlCustomerListSchema,
  controlCustomerSchema,
  createUserRequestSchema,
  updateUserRequestSchema,
  userMutationResultSchema,
} from '@pressly/contracts/users';
import type { ControlExperience } from '@pressly/control-experience';
import { apiSuccess } from '@pressly/http';
import { defineValidatedController } from '@pressly/http/express';
import { Router, type RequestHandler } from 'express';
import { controlResultValue } from '../control-experience.error.ts';
import { readControlRequestContext } from '../control-request-context.adapter.ts';

export const makeControlCustomerRoutes = (input: {
  application: ControlExperience['customers'];
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
    request: { query: controlCustomerListQuerySchema },
    handle: async ({ query }, { response }) => {
      const page = controlResultValue(
        await input.application.list({
          context: readControlRequestContext(response),
          ...(query.query === undefined ? {} : { query: query.query }),
          ...(query.active === undefined ? {} : { active: query.active }),
          limit: query.limit,
          ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
        }),
      );
      response.json(
        apiSuccess(
          controlCustomerListSchema.parse({
            items: page.items,
            nextCursor: page.nextCursor,
          }),
        ),
      );
    },
  });

  const getController = defineValidatedController({
    request: { params: canonicalUserParamsSchema },
    handle: async ({ params }, { response }) => {
      const customer = controlResultValue(
        await input.application.get({
          context: readControlRequestContext(response),
          userId: params.userId,
        }),
      );
      response.json(apiSuccess(controlCustomerSchema.parse(customer)));
    },
  });

  const createController = defineValidatedController({
    request: { body: createUserRequestSchema },
    handle: async ({ body }, { response }) => {
      const outcome = controlResultValue(
        await input.application.create({
          ...body,
          context: readControlRequestContext(response),
        }),
      );
      response
        .status(201)
        .json(apiSuccess(userMutationResultSchema.parse(outcome)));
    },
  });

  const updateController = defineValidatedController({
    request: {
      params: canonicalUserParamsSchema,
      body: updateUserRequestSchema,
    },
    handle: async ({ params, body }, { response }) => {
      const outcome = controlResultValue(
        await input.application.update({
          userId: params.userId,
          idempotencyKey: body.idempotencyKey,
          expectedVersion: body.expectedVersion,
          changes: {
            ...(body.changes.firstName === undefined
              ? {}
              : { firstName: body.changes.firstName }),
            ...(body.changes.lastName === undefined
              ? {}
              : { lastName: body.changes.lastName }),
            ...(body.changes.businessName === undefined
              ? {}
              : { businessName: body.changes.businessName }),
            ...(body.changes.phone === undefined
              ? {}
              : { phone: body.changes.phone }),
            ...(body.changes.email === undefined
              ? {}
              : { email: body.changes.email }),
            ...(body.changes.active === undefined
              ? {}
              : { active: body.changes.active }),
          },
          context: readControlRequestContext(response),
        }),
      );
      response.json(apiSuccess(userMutationResultSchema.parse(outcome)));
    },
  });

  routes.get(
    '/customers',
    ...read,
    listController.validate,
    listController.handle,
  );

  routes.get(
    '/customers/:userId',
    ...read,
    getController.validate,
    getController.handle,
  );

  routes.post(
    '/customers',
    ...write,
    createController.validate,
    createController.handle,
  );

  routes.patch(
    '/customers/:userId',
    ...write,
    updateController.validate,
    updateController.handle,
  );

  return routes;
};
