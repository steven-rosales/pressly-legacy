import type { RequestHandler } from 'express';
import { catchAsync, sendApiResult } from '@pressly/http/express';
import type { LoadSchedule } from './load-schedule.port.ts';

export const makeLoadScheduleController = (
  loadSchedule: LoadSchedule,
): RequestHandler =>
  catchAsync(async (request, response) => {
    sendApiResult(
      response,
      await loadSchedule({
        locationId: request.params['locationId'] as string,
        scheduleRunId: request.params['scheduleRunId'] as string,
      }),
    );
  });
