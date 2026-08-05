import { Router, type RequestHandler } from 'express';
import type { LoadSchedule } from './load-schedule.port.ts';
import { makeLoadScheduleController } from './load-schedule.controller.ts';

export const makeLoadScheduleRoute = (input: {
  loadSchedule: LoadSchedule;
  authenticate: RequestHandler;
  authorize: RequestHandler;
}): Router => {
  const router = Router();
  const controller = makeLoadScheduleController(input.loadSchedule);
  router.get(
    '/production/locations/:locationId/schedules/:scheduleRunId',
    input.authenticate,
    controller.validate,
    input.authorize,
    controller.handle,
  );
  return router;
};
