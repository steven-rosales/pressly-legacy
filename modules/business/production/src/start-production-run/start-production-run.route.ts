import { Router, type RequestHandler } from 'express';
import {
  productionRunParamsSchema,
  productionRunRequestSchema,
} from '@pressly/contracts';
import { validateRequest } from '@pressly/http/express';
import type { StartProductionRun } from './start-production-run.usecase.ts';
import { makeStartProductionRunController } from './start-production-run.controller.ts';

export const makeStartProductionRunRoute = (input: {
  startRun: StartProductionRun;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): Router => {
  const router = Router();
  router.post(
    '/production/locations/:locationId/runs/:productionRunId/start',
    input.authenticate,
    validateRequest({
      params: productionRunParamsSchema,
      body: productionRunRequestSchema,
    }),
    input.authorize,
    makeStartProductionRunController(input),
  );
  return router;
};
