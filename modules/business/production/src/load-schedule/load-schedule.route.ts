import { Router, type RequestHandler } from 'express';
import { productionScheduleParamsSchema } from '@pressly/contracts';
import { validateRequest } from '@pressly/http/express';
import type { LoadSchedule } from './load-schedule.usecase.ts';
import { makeLoadScheduleController } from './load-schedule.controller.ts';

export const makeLoadScheduleRoute = (input: {
  loadSchedule: LoadSchedule;
  authenticate: RequestHandler;
  authorize: RequestHandler;
}): Router => {
  const router = Router();
  router.get(
    '/production/locations/:locationId/schedules/:scheduleRunId',
    input.authenticate,
    validateRequest({ params: productionScheduleParamsSchema }),
    input.authorize,
    makeLoadScheduleController(input.loadSchedule),
  );
  return router;
};
