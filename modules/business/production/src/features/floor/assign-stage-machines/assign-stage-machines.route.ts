import { Router, type RequestHandler } from 'express';
import type { AssignStageMachines } from './assign-stage-machines.usecase.ts';
import {
  assignStageMachinesBoundary,
  makeAssignStageMachinesController,
} from './assign-stage-machines.controller.ts';

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
    assignStageMachinesBoundary.validate,
    input.authorize,
    makeAssignStageMachinesController(input),
  );
  return router;
};
