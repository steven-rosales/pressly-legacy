import {
  productionScheduleParamsSchema,
  startScheduleRequestSchema,
} from '@pressly/contracts';
import { validateRequest } from '@pressly/http/express';
import { Router, type RequestHandler } from 'express';
import { makeStartScheduleController } from './start-schedule.controller.ts';
import type { StartSchedule } from './start-schedule.usecase.ts';

export const makeStartScheduleRoute = (input: {
  startSchedule: StartSchedule;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): Router => {
  const router = Router();
  router.post(
    '/production/locations/:locationId/schedules/:scheduleRunId/start',
    input.authenticate,
    validateRequest({
      params: productionScheduleParamsSchema,
      body: startScheduleRequestSchema,
    }),
    input.authorize,
    makeStartScheduleController(input),
  );
  return router;
};
