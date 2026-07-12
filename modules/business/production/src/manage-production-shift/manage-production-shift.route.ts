import { Router, type RequestHandler } from 'express';
import {
  createProductionShiftRequestSchema,
  productionLocationParamsSchema,
} from '@pressly/contracts';
import { validateRequest } from '@pressly/http/express';
import type { CreateProductionShift } from './manage-production-shift.usecase.ts';
import { makeCreateProductionShiftController } from './manage-production-shift.controller.ts';

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
