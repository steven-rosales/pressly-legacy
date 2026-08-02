import type { RequestHandler } from 'express';
import type { AcceptScheduleCommand } from '@pressly/contracts';
import { catchAsync, sendApiResult } from '@pressly/http/express';
import type { AcceptSchedule } from './accept-schedule.port.ts';

export const makeAcceptScheduleController = (input: {
  acceptSchedule: AcceptSchedule;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): RequestHandler =>
  catchAsync(async (request, response) => {
    sendApiResult(
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
