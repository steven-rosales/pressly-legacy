import { Router, type RequestHandler } from 'express';
import { makeUpdateProductionShiftController } from './update-production-shift.controller.ts';
import type { UpdateProductionShift } from './update-production-shift.port.ts';

export const makeUpdateProductionShiftRoute = (input: {
  update: UpdateProductionShift;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): Router => {
  const router = Router();
  const controller = makeUpdateProductionShiftController(input);
  router.patch(
    '/production/locations/:locationId/shifts/:productionShiftId',
    input.authenticate,
    controller.validate,
    input.authorize,
    controller.handle,
  );
  return router;
};
