import type { RequestHandler } from 'express';
import type { AcceptScheduleCommand } from '@pressly/contracts';
import { catchAsync } from '@pressly/http/express';
import { sendProductionResult } from '../http/production-response.ts';
import type { AcceptSchedule } from './accept-schedule.port.ts';

export const makeAcceptScheduleController = (input: {
  acceptSchedule: AcceptSchedule;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): RequestHandler =>
  catchAsync(async (request, response) => {
    sendProductionResult(
      response,
      await input.acceptSchedule({
        ...(request.body as Omit<
          AcceptScheduleCommand,
          'locationId' | 'scheduleRunId'
        >),
        locationId: request.params['locationId'] as string,
        scheduleRunId: request.params['scheduleRunId'] as string,
        actorId: input.readActorId(response),
      }),
      201,
    );
  });
