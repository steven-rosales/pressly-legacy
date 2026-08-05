import { Router, type RequestHandler } from 'express';
import type { AcceptSchedule } from './accept-schedule.port.ts';
import { makeAcceptScheduleController } from './accept-schedule.controller.ts';

export const makeAcceptScheduleRoute = (input: {
  acceptSchedule: AcceptSchedule;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): Router => {
  const router = Router();
  const controller = makeAcceptScheduleController(input);
  router.post(
    '/production/locations/:locationId/schedules/:scheduleRunId/accept',
    input.authenticate,
    controller.validate,
    input.authorize,
    controller.handle,
  );
  return router;
};
