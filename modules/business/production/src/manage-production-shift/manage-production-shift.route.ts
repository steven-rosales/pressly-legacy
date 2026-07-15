import { Router, type RequestHandler } from 'express';
import {
  createProductionShiftRequestSchema,
  productionLocationParamsSchema,
  productionShiftParamsSchema,
  updateProductionShiftRequestSchema,
} from '@pressly/contracts';
import { validateRequest } from '@pressly/http/express';
import type { CreateProductionShift } from './manage-production-shift.usecase.ts';
import type { UpdateProductionShift } from './manage-production-shift.usecase.ts';
import {
  makeCreateProductionShiftController,
  makeUpdateProductionShiftController,
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
    validateRequest({
      params: productionLocationParamsSchema,
      body: createProductionShiftRequestSchema,
    }),
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
    validateRequest({
      params: productionShiftParamsSchema,
      body: updateProductionShiftRequestSchema,
    }),
    input.authorize,
    makeUpdateProductionShiftController(input),
  );
  return router;
};
