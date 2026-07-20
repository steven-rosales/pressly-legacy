import {
  confirmProductionOrderOvertimeRequestSchema,
  placeProductionOrderAutomaticallyRequestSchema,
  placeProductionOrderExactlyRequestSchema,
  productionIdSchema,
  productionRunParamsSchema,
} from '@pressly/contracts';
import { validateRequest } from '@pressly/http/express';
import { Router, type RequestHandler } from 'express';
import {
  makeConfirmProductionOrderOvertimeController,
  makePlaceProductionOrderAutomaticallyController,
  makePlaceProductionOrderExactlyController,
} from './place-production-order.controller.ts';
import type {
  ConfirmProductionOrderOvertime,
  PlaceProductionOrderAutomatically,
  PlaceProductionOrderExactly,
} from './place-production-order.usecase.ts';

const runOrderParamsSchema = productionRunParamsSchema
  .extend({ productionOrderId: productionIdSchema })
  .strict();
const runBatchOrderParamsSchema = runOrderParamsSchema
  .extend({ productionBatchId: productionIdSchema })
  .strict();

export const makePlaceProductionOrderRoutes = (input: {
  placeAutomatically: PlaceProductionOrderAutomatically;
  placeExactly: PlaceProductionOrderExactly;
  confirmOvertime: ConfirmProductionOrderOvertime;
  authenticate: RequestHandler;
  authorizeOverride: RequestHandler;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): Router => {
  const router = Router();
  router.post(
    '/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/place',
    input.authenticate,
    validateRequest({
      params: runOrderParamsSchema,
      body: placeProductionOrderAutomaticallyRequestSchema,
    }),
    input.authorizeOverride,
    makePlaceProductionOrderAutomaticallyController({
      place: input.placeAutomatically,
      readActorId: input.readActorId,
    }),
  );
  router.post(
    '/production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/orders/:productionOrderId/place',
    input.authenticate,
    validateRequest({
      params: runBatchOrderParamsSchema,
      body: placeProductionOrderExactlyRequestSchema,
    }),
    input.authorizeOverride,
    makePlaceProductionOrderExactlyController({
      place: input.placeExactly,
      readActorId: input.readActorId,
    }),
  );
  router.post(
    '/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/confirm-overtime',
    input.authenticate,
    validateRequest({
      params: runOrderParamsSchema,
      body: confirmProductionOrderOvertimeRequestSchema,
    }),
    input.authorizeOverride,
    makeConfirmProductionOrderOvertimeController({
      confirm: input.confirmOvertime,
      readActorId: input.readActorId,
    }),
  );
  return router;
};
