import { Router, type RequestHandler } from 'express';
import { makeStartScheduleController } from './start-schedule.controller.ts';
import type { StartSchedule } from './start-schedule.port.ts';

export const makeStartScheduleRoute = (input: {
  startSchedule: StartSchedule;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): Router => {
  const router = Router();
  const controller = makeStartScheduleController(input);

  router.post(
    '/production/locations/:locationId/schedules/:scheduleRunId/start',
    input.authenticate,
    controller.validate,
    input.authorize,
    controller.handle,
  );

  return router;
};
