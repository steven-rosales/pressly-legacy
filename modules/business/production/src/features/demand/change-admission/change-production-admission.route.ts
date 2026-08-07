import { Router, type RequestHandler } from 'express';
import { makeChangeProductionAdmissionController } from './change-production-admission.controller.ts';
import type { ChangeProductionAdmission } from './change-production-admission.port.ts';

export const makeChangeProductionAdmissionRoute = (input: {
  changeAdmission: ChangeProductionAdmission;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): Router => {
  const router = Router();
  const controller = makeChangeProductionAdmissionController(input);
  router.put(
    '/production/locations/:locationId/orders/:productionOrderId/admission',
    input.authenticate,
    controller.validate,
    input.authorize,
    controller.handle,
  );
  return router;
};
