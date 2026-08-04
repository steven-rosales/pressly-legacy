import { Router, type RequestHandler } from 'express';
import {
  changeProductionAdmissionBoundary,
  makeChangeProductionAdmissionController,
} from './change-production-admission.controller.ts';
import type { ChangeProductionAdmission } from './change-production-admission.usecase.ts';

export const makeChangeProductionAdmissionRoute = (input: {
  changeAdmission: ChangeProductionAdmission;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): Router => {
  const router = Router();
  router.put(
    '/production/locations/:locationId/orders/:productionOrderId/admission',
    input.authenticate,
    changeProductionAdmissionBoundary.validate,
    input.authorize,
    makeChangeProductionAdmissionController(input),
  );
  return router;
};
