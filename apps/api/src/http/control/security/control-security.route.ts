import type { ControlExperience } from '@pressly/control-experience';
import { controlSecurityEventQuerySchema } from '@pressly/contracts/auth';
import { apiSuccess } from '@pressly/http';
import { defineValidatedController } from '@pressly/http/express';
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
  const listController = defineValidatedController({
    request: { query: controlSecurityEventQuerySchema },
    handle: async ({ query }, { response }) => {
      const outcome = await input.application.listEvents({
        context: readControlRequestContext(response),
        ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
        limit: query.limit,
      });

      response.json(apiSuccess(controlResultValue(outcome)));
    },
  });

  routes.get(
    '/security/events',
    input.authenticate,
    input.limitIdentity,
    input.requireRead,
    listController.validate,
    listController.handle,
  );

  return routes;
};
