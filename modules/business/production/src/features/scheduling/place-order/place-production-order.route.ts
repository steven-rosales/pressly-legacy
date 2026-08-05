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
} from './place-production-order.port.ts';

export const makePlaceProductionOrderRoutes = (input: {
  placeAutomatically: PlaceProductionOrderAutomatically;
  placeExactly: PlaceProductionOrderExactly;
  confirmOvertime: ConfirmProductionOrderOvertime;
  authenticate: RequestHandler;
  authorizeOverride: RequestHandler;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): Router => {
  const router = Router();
  const automaticController = makePlaceProductionOrderAutomaticallyController({
    place: input.placeAutomatically,
    readActorId: input.readActorId,
  });
  const exactController = makePlaceProductionOrderExactlyController({
    place: input.placeExactly,
    readActorId: input.readActorId,
  });
  const overtimeController = makeConfirmProductionOrderOvertimeController({
    confirm: input.confirmOvertime,
    readActorId: input.readActorId,
  });
  router.post(
    '/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/place',
    input.authenticate,
    automaticController.validate,
    input.authorizeOverride,
    automaticController.handle,
  );
  router.post(
    '/production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/orders/:productionOrderId/place',
    input.authenticate,
    exactController.validate,
    input.authorizeOverride,
    exactController.handle,
  );
  router.post(
    '/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/confirm-overtime',
    input.authenticate,
    overtimeController.validate,
    input.authorizeOverride,
    overtimeController.handle,
  );
  return router;
};
