import type { RequestHandler } from 'express';
import type { CreateScheduleCommand } from '@pressly/contracts';
import { catchAsync } from '@pressly/http/express';
import { sendProductionResult } from '../http/production-response.ts';
import type { CreateSchedule } from './create-schedule.port.ts';

export const makeCreateScheduleController = (input: {
  createSchedule: CreateSchedule;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): RequestHandler =>
  catchAsync(async (request, response) => {
    sendProductionResult(
      response,
      await input.createSchedule({
        ...(request.body as Omit<CreateScheduleCommand, 'locationId'>),
        locationId: request.params['locationId'] as string,
        actorId: input.readActorId(response),
      }),
      201,
    );
  });
