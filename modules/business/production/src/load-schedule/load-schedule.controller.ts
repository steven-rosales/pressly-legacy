import type { RequestHandler } from 'express';
import { catchAsync } from '@pressly/http/express';
import { sendProductionResult } from '../http/production-response.ts';
import type { LoadSchedule } from './load-schedule.port.ts';

export const makeLoadScheduleController = (
  loadSchedule: LoadSchedule,
): RequestHandler =>
  catchAsync(async (request, response) => {
    sendProductionResult(
      response,
      await loadSchedule({
        locationId: request.params['locationId'] as string,
        scheduleRunId: request.params['scheduleRunId'] as string,
      }),
    );
  });
