import {
  canonicalUserParamsSchema,
  controlCustomerListQuerySchema,
  controlCustomerListSchema,
  controlCustomerSchema,
  createUserRequestSchema,
  updateUserRequestSchema,
  userMutationResultSchema,
} from '@pressly/contracts';
import { apiSuccess } from '@pressly/http';
import { catchAsync, validateRequest } from '@pressly/http/express';
import type { UsersApplication } from '@pressly/users';
import { Router, type RequestHandler } from 'express';
import {
  controlAccess,
  controlCommandContext,
} from './control-data.context.ts';
import { controlCustomer } from './control-data.mapper.ts';

const value = <Value>(
  outcome:
    | Readonly<{ tag: 'ok'; value: Value }>
    | Readonly<{ tag: 'err'; error: unknown }>,
): Value => {
  if (outcome.tag === 'err') throw outcome.error;
  return outcome.value;
};

export const makeControlCustomerRoutes = (input: {
  users: Pick<
    UsersApplication,
    'listUsers' | 'getUser' | 'createUser' | 'updateUser'
  >;
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
      const page = value(
        await input.users.listUsers({
          businessId: controlAccess(response).business.id,
          query: query.query ?? null,
          active: query.active ?? null,
          limit: query.limit,
          cursor: query.cursor ?? null,
        }),
      );
      response.json(
        apiSuccess(
          controlCustomerListSchema.parse({
            items: page.items.map(controlCustomer),
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
      const customer = value(
        await input.users.getUser({
          businessId: controlAccess(response).business.id,
          userId: request.params['userId'] as string,
        }),
      );
      response.json(
        apiSuccess(controlCustomerSchema.parse(controlCustomer(customer))),
      );
    }),
  );

  routes.post(
    '/customers',
    ...write,
    validateRequest({ body: createUserRequestSchema }),
    catchAsync(async (request, response) => {
      const outcome = value(
        await input.users.createUser({
          ...request.body,
          businessId: controlAccess(response).business.id,
          context: controlCommandContext(response),
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
      const outcome = value(
        await input.users.updateUser({
          ...request.body,
          businessId: controlAccess(response).business.id,
          userId: request.params['userId'] as string,
          context: controlCommandContext(response),
        }),
      );
      response.json(apiSuccess(userMutationResultSchema.parse(outcome)));
    }),
  );

  return routes;
};
