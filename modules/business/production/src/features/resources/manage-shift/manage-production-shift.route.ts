import { Router, type RequestHandler } from 'express';
import type { CreateProductionShift } from './manage-production-shift.usecase.ts';
import type { UpdateProductionShift } from './manage-production-shift.usecase.ts';
import {
  createProductionShiftBoundary,
  makeCreateProductionShiftController,
  makeUpdateProductionShiftController,
  updateProductionShiftBoundary,
} from './manage-production-shift.controller.ts';

export const makeCreateProductionShiftRoute = (input: {
  create: CreateProductionShift;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): Router => {
  const router = Router();
  router.post(
    '/production/locations/:locationId/shifts',
    input.authenticate,
    createProductionShiftBoundary.validate,
    input.authorize,
    makeCreateProductionShiftController(input),
  );
  return router;
};

export const makeUpdateProductionShiftRoute = (input: {
  update: UpdateProductionShift;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): Router => {
  const router = Router();
  router.patch(
    '/production/locations/:locationId/shifts/:productionShiftId',
    input.authenticate,
    updateProductionShiftBoundary.validate,
    input.authorize,
    makeUpdateProductionShiftController(input),
  );
  return router;
};
