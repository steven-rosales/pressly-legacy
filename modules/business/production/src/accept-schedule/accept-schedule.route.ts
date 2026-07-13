import { Router, type RequestHandler } from 'express';
import {
  acceptScheduleRequestSchema,
  productionScheduleParamsSchema,
} from '@pressly/contracts';
import { validateRequest } from '@pressly/http/express';
import type { AcceptSchedule } from './accept-schedule.usecase.ts';
import { makeAcceptScheduleController } from './accept-schedule.controller.ts';

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
    validateRequest({
      params: productionScheduleParamsSchema,
      body: acceptScheduleRequestSchema,
    }),
    input.authorize,
    makeAcceptScheduleController(input),
  );
  return router;
};
