import { Router, type RequestHandler } from 'express';
import type { CreateSchedule } from './create-schedule.usecase.ts';
import {
  createScheduleBoundary,
  makeCreateScheduleController,
} from './create-schedule.controller.ts';

export const makeCreateScheduleRoute = (input: {
  createSchedule: CreateSchedule;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): Router => {
  const router = Router();
  router.post(
    '/production/locations/:locationId/schedules',
    input.authenticate,
    createScheduleBoundary.validate,
    input.authorize,
    makeCreateScheduleController(input),
  );
  return router;
};
