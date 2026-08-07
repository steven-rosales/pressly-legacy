import { Router, type RequestHandler } from 'express';
import type { AdvanceProductionStage } from './advance-production-stage.port.ts';
import { makeAdvanceProductionStageController } from './advance-production-stage.controller.ts';

export const makeAdvanceProductionStageRoute = (input: {
  advance: AdvanceProductionStage;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): Router => {
  const router = Router();

  for (const transition of ['start', 'complete'] as const) {
    const controller = makeAdvanceProductionStageController({
      ...input,
      transition,
    });
    router.post(
      `/production/locations/:locationId/stages/:stageRunId/${transition}`,
      input.authenticate,
      controller.validate,
      input.authorize,
      controller.handle,
    );
  }

  return router;
};
