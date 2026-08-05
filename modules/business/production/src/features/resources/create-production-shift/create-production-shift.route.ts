import { Router, type RequestHandler } from 'express';
import { makeCreateProductionShiftController } from './create-production-shift.controller.ts';
import type { CreateProductionShift } from './create-production-shift.port.ts';

export const makeCreateProductionShiftRoute = (input: {
  create: CreateProductionShift;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): Router => {
  const router = Router();
  const controller = makeCreateProductionShiftController(input);
  router.post(
    '/production/locations/:locationId/shifts',
    input.authenticate,
    controller.validate,
    input.authorize,
    controller.handle,
  );
  return router;
};
