import { Router, type RequestHandler } from 'express';
import {
  assignStageMachinesRequestSchema,
  productionStageParamsSchema,
} from '@pressly/contracts';
import { validateRequest } from '@pressly/http/express';
import type { AssignStageMachines } from './assign-stage-machines.usecase.ts';
import { makeAssignStageMachinesController } from './assign-stage-machines.controller.ts';

export const makeAssignStageMachinesRoute = (input: {
  assign: AssignStageMachines;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): Router => {
  const router = Router();
  router.put(
    '/production/locations/:locationId/stages/:stageRunId/machines',
    input.authenticate,
    validateRequest({
      params: productionStageParamsSchema,
      body: assignStageMachinesRequestSchema,
    }),
    input.authorize,
    makeAssignStageMachinesController(input),
  );
  return router;
};
