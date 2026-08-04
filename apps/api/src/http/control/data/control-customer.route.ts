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
import { catchAsync, validateRequest } from '@pressly/http/express';
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

  routes.get(
    '/customers',
    ...read,
    validateRequest({ query: controlCustomerListQuerySchema }),
    catchAsync(async (request, response) => {
      const query = request.query as unknown as {
        query?: string;
        active?: boolean;
        cursor?: string;
        limit: number;
      };
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
    }),
  );

  routes.get(
    '/customers/:userId',
    ...read,
    validateRequest({ params: canonicalUserParamsSchema }),
    catchAsync(async (request, response) => {
      const customer = controlResultValue(
        await input.application.get({
          context: readControlRequestContext(response),
          userId: request.params['userId'] as string,
        }),
      );
      response.json(apiSuccess(controlCustomerSchema.parse(customer)));
    }),
  );

  routes.post(
    '/customers',
    ...write,
    validateRequest({ body: createUserRequestSchema }),
    catchAsync(async (request, response) => {
      const outcome = controlResultValue(
        await input.application.create({
          ...request.body,
          context: readControlRequestContext(response),
        }),
      );
      response
        .status(201)
        .json(apiSuccess(userMutationResultSchema.parse(outcome)));
    }),
  );

  routes.patch(
    '/customers/:userId',
    ...write,
    validateRequest({ params: canonicalUserParamsSchema }),
    validateRequest({ body: updateUserRequestSchema }),
    catchAsync(async (request, response) => {
      const outcome = controlResultValue(
        await input.application.update({
          ...request.body,
          userId: request.params['userId'] as string,
          context: readControlRequestContext(response),
        }),
      );
      response.json(apiSuccess(userMutationResultSchema.parse(outcome)));
    }),
  );

  return routes;
};
