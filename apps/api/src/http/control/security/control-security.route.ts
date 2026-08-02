import type { WorkforceApplication } from '@pressly/auth-module';
import { controlSecurityEventQuerySchema } from '@pressly/contracts';
import { invariantViolationError } from '@pressly/errors';
import { apiSuccess } from '@pressly/http';
import { catchAsync, validateRequest } from '@pressly/http/express';
import { Router, type RequestHandler, type Response } from 'express';
import type {
  ControlAccess,
  LoadedControlSession,
} from '../session/control-session.port.ts';

const actor = (response: Response) => {
  const auth = response.locals['auth'] as LoadedControlSession;
  if (auth.principal.sessionId === undefined)
    throw invariantViolationError({
      code: 'control_session_id_missing',
      message: 'Authenticated Control principal is missing a session ID.',
      safeMessage: 'Session could not be loaded.',
    });
  return {
    identityId: auth.principal.identityId,
    sessionId: auth.principal.sessionId,
  };
};

const access = (response: Response): ControlAccess =>
  response.locals['controlAccess'] as ControlAccess;

export const makeControlSecurityRoutes = (input: {
  application: WorkforceApplication;
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
      const outcome = await input.application.listSecurityEvents({
        actor: actor(response),
        businessId: access(response).business.id,
        ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
        limit: query.limit,
      });
      if (outcome.tag === 'err') throw outcome.error;
      response.json(apiSuccess(outcome.value));
    }),
  );

  return routes;
};
