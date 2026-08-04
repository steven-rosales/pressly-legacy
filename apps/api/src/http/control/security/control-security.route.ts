import type { ControlExperience } from '@pressly/control-experience';
import { controlSecurityEventQuerySchema } from '@pressly/contracts/auth';
import { apiSuccess } from '@pressly/http';
import { catchAsync, validateRequest } from '@pressly/http/express';
import { Router, type RequestHandler } from 'express';
import { controlResultValue } from '../control-experience.error.ts';
import { readControlRequestContext } from '../control-request-context.adapter.ts';

export const makeControlSecurityRoutes = (input: {
  application: ControlExperience['security'];
  authenticate: RequestHandler;
  limitIdentity: RequestHandler;
  requireRead: RequestHandler;
}): Router => {
  const routes = Router();

  routes.get(
    '/security/events',
    input.authenticate,
    input.limitIdentity,
    input.requireRead,
    validateRequest({ query: controlSecurityEventQuerySchema }),
    catchAsync(async (request, response) => {
      const query = request.query as unknown as {
        cursor?: string;
        limit: number;
      };
      const outcome = await input.application.listEvents({
        context: readControlRequestContext(response),
        ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
        limit: query.limit,
      });

      response.json(apiSuccess(controlResultValue(outcome)));
    }),
  );

  return routes;
};
