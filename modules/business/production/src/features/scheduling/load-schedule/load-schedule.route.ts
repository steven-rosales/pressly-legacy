import { Router, type RequestHandler } from 'express';
import type { LoadSchedule } from './load-schedule.usecase.ts';
import {
  loadScheduleBoundary,
  makeLoadScheduleController,
} from './load-schedule.controller.ts';

export const makeLoadScheduleRoute = (input: {
  loadSchedule: LoadSchedule;
  authenticate: RequestHandler;
  authorize: RequestHandler;
}): Router => {
  const router = Router();
  router.get(
    '/production/locations/:locationId/schedules/:scheduleRunId',
    input.authenticate,
    loadScheduleBoundary.validate,
    input.authorize,
    makeLoadScheduleController(input.loadSchedule),
  );
  return router;
};
