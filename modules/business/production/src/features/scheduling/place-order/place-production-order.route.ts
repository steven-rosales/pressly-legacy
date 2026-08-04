import { Router, type RequestHandler } from 'express';
import {
  makeConfirmProductionOrderOvertimeController,
  makePlaceProductionOrderAutomaticallyController,
  makePlaceProductionOrderExactlyController,
  placeProductionOrderBoundaries,
} from './place-production-order.controller.ts';
import type {
  ConfirmProductionOrderOvertime,
  PlaceProductionOrderAutomatically,
  PlaceProductionOrderExactly,
} from './place-production-order.usecase.ts';

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
    placeProductionOrderBoundaries.automatic.validate,
    input.authorizeOverride,
    makePlaceProductionOrderAutomaticallyController({
      place: input.placeAutomatically,
      readActorId: input.readActorId,
    }),
  );
  router.post(
    '/production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/orders/:productionOrderId/place',
    input.authenticate,
    placeProductionOrderBoundaries.exact.validate,
    input.authorizeOverride,
    makePlaceProductionOrderExactlyController({
      place: input.placeExactly,
      readActorId: input.readActorId,
    }),
  );
  router.post(
    '/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/confirm-overtime',
    input.authenticate,
    placeProductionOrderBoundaries.confirmOvertime.validate,
    input.authorizeOverride,
    makeConfirmProductionOrderOvertimeController({
      confirm: input.confirmOvertime,
      readActorId: input.readActorId,
    }),
  );
  return router;
};
