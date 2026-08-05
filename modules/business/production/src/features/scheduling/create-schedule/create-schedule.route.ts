import { Router, type RequestHandler } from 'express';
import type { CreateSchedule } from './create-schedule.port.ts';
import { makeCreateScheduleController } from './create-schedule.controller.ts';

export const makeCreateScheduleRoute = (input: {
  createSchedule: CreateSchedule;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): Router => {
  const router = Router();
  const controller = makeCreateScheduleController(input);
  router.post(
    '/production/locations/:locationId/schedules',
    input.authenticate,
    controller.validate,
    input.authorize,
    controller.handle,
  );
  return router;
};
