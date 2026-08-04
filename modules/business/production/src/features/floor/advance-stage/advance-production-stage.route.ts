import { Router, type RequestHandler } from 'express';
import type { AdvanceProductionStage } from './advance-production-stage.usecase.ts';
import {
  advanceProductionStageBoundaries,
  makeAdvanceProductionStageController,
} from './advance-production-stage.controller.ts';

export const makeAdvanceProductionStageRoute = (input: {
  advance: AdvanceProductionStage;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): Router => {
  const router = Router();

  for (const transition of ['start', 'complete'] as const)
    router.post(
      `/production/locations/:locationId/stages/:stageRunId/${transition}`,
      input.authenticate,
      advanceProductionStageBoundaries[transition].validate,
      input.authorize,
      makeAdvanceProductionStageController({ ...input, transition }),
    );

  return router;
};
