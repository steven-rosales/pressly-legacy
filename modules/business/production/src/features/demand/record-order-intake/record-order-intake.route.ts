import { Router, type RequestHandler } from 'express';
import { makeRecordOrderIntakeController } from './record-order-intake.controller.ts';
import type { RecordOrderIntake } from './record-order-intake.port.ts';

export const makeRecordOrderIntakeRoute = (input: {
  recordIntake: RecordOrderIntake;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): Router => {
  const router = Router();
  const controller = makeRecordOrderIntakeController(input);
  router.put(
    '/production/locations/:locationId/orders/:productionOrderId/intake',
    input.authenticate,
    controller.validate,
    input.authorize,
    controller.handle,
  );
  return router;
};
