import { Router, type RequestHandler } from 'express';
import type { AssignStageMachines } from './assign-stage-machines.port.ts';
import { makeAssignStageMachinesController } from './assign-stage-machines.controller.ts';

export const makeAssignStageMachinesRoute = (input: {
  assign: AssignStageMachines;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): Router => {
  const router = Router();
  const controller = makeAssignStageMachinesController(input);
  router.put(
    '/production/locations/:locationId/stages/:stageRunId/machines',
    input.authenticate,
    controller.validate,
    input.authorize,
    controller.handle,
  );
  return router;
};
