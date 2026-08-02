import type { RequestHandler } from 'express';
import type { CreateScheduleCommand } from '@pressly/contracts';
import { catchAsync, sendApiResult } from '@pressly/http/express';
import type { CreateSchedule } from './create-schedule.port.ts';

export const makeCreateScheduleController = (input: {
  createSchedule: CreateSchedule;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): RequestHandler =>
  catchAsync(async (request, response) => {
    sendApiResult(
      response,
      await input.createSchedule({
        ...(request.body as Omit<CreateScheduleCommand, 'locationId'>),
        locationId: request.params['locationId'] as string,
        actorId: input.readActorId(response),
      }),
      201,
    );
  });
