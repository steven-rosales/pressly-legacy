import type { StartScheduleCommand } from '@pressly/contracts';
import { catchAsync } from '@pressly/http/express';
import type { RequestHandler } from 'express';
import { sendProductionResult } from '../http/production-response.ts';
import type { StartSchedule } from './start-schedule.port.ts';

export const makeStartScheduleController = (input: {
  startSchedule: StartSchedule;
  readActorId: (response: Parameters<RequestHandler>[1]) => string;
}): RequestHandler =>
  catchAsync(async (request, response) => {
    sendProductionResult(
      response,
      await input.startSchedule({
        ...(request.body as Omit<
          StartScheduleCommand,
          'locationId' | 'scheduleRunId'
        >),
        locationId: request.params['locationId'] as string,
        scheduleRunId: request.params['scheduleRunId'] as string,
        actorId: input.readActorId(response),
      }),
      201,
    );
  });
