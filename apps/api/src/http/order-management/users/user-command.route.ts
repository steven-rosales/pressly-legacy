import {
  canonicalUserParamsSchema,
  createUserRequestSchema,
  updateUserRequestSchema,
  userMutationResultSchema,
} from '@pressly/contracts';
import { apiSuccess } from '@pressly/http';
import { catchAsync, validateRequest } from '@pressly/http/express';
import type { UsersApplication } from '@pressly/users';
import { Router, type RequestHandler } from 'express';
import {
  orderManagementCommandContext,
  type ReadOrderManagementPrincipal,
} from '../command-context.mapper.ts';

export const makeUserCommandRoutes = (input: {
  users: Pick<UsersApplication, 'createUser' | 'updateUser'>;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readPrincipal: ReadOrderManagementPrincipal;
}): Router => {
  const routes = Router();

  routes.post(
    '/order-management/users',
    input.authenticate,
    input.authorize,
    validateRequest({ body: createUserRequestSchema }),
    catchAsync(async (request, response) => {
      const outcome = await input.users.createUser({
        ...request.body,
        context: orderManagementCommandContext(response, input.readPrincipal),
      });
      if (outcome.tag === 'err') throw outcome.error;
      response
        .status(201)
        .json(apiSuccess(userMutationResultSchema.parse(outcome.value)));
    }),
  );
  routes.patch(
    '/order-management/users/:userId',
    input.authenticate,
    validateRequest({ params: canonicalUserParamsSchema }),
    input.authorize,
    validateRequest({ body: updateUserRequestSchema }),
    catchAsync(async (request, response) => {
      const outcome = await input.users.updateUser({
        ...request.body,
        context: orderManagementCommandContext(response, input.readPrincipal),
        userId: request.params['userId'] as string,
      });
      if (outcome.tag === 'err') throw outcome.error;
      response.json(apiSuccess(userMutationResultSchema.parse(outcome.value)));
    }),
  );

  return routes;
};
