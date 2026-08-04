import { Router, type RequestHandler } from 'express';
import type { AcceptSchedule } from './accept-schedule.usecase.ts';
import {
  acceptScheduleBoundary,
  makeAcceptScheduleController,
} from './accept-schedule.controller.ts';

export const makeAcceptScheduleRoute = (input: {
  acceptSchedule: AcceptSchedule;
  authenticate: RequestHandler;
  authorize: RequestHandler;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): Router => {
  const router = Router();
  router.post(
    '/production/locations/:locationId/schedules/:scheduleRunId/accept',
    input.authenticate,
    acceptScheduleBoundary.validate,
    input.authorize,
    makeAcceptScheduleController(input),
  );
  return router;
};
