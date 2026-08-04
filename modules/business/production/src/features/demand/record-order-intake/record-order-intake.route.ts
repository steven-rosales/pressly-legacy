import { Router, type RequestHandler } from 'express';
import {
  makeRecordOrderIntakeController,
  recordOrderIntakeBoundary,
} from './record-order-intake.controller.ts';
import type { RecordOrderIntake } from './record-order-intake.usecase.ts';

export const makeRecordOrderIntakeRoute = (input: {
  recordIntake: RecordOrderIntake;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): Router => {
  const router = Router();
  router.put(
    '/production/locations/:locationId/orders/:productionOrderId/intake',
    input.authenticate,
    recordOrderIntakeBoundary.validate,
    input.authorize,
    makeRecordOrderIntakeController(input),
  );
  return router;
};
