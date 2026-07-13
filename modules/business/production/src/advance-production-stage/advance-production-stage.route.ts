import { Router, type RequestHandler } from 'express';
import {
  productionStageParamsSchema,
  stageRequestSchema,
} from '@pressly/contracts';
import { validateRequest } from '@pressly/http/express';
import type { AdvanceProductionStage } from './advance-production-stage.usecase.ts';
import { makeAdvanceProductionStageController } from './advance-production-stage.controller.ts';

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
      validateRequest({
        params: productionStageParamsSchema,
        body: stageRequestSchema,
      }),
      input.authorize,
      makeAdvanceProductionStageController({ ...input, transition }),
    );

  return router;
};
