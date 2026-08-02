import { catchAsync, sendApiResult } from '@pressly/http/express';
import type { RequestHandler } from 'express';
import type { LoadRemainingDayForecast } from './load-remaining-day-forecast.port.ts';

export const makeLoadRemainingDayForecastController = (
  loadForecast: LoadRemainingDayForecast,
): RequestHandler =>
  catchAsync(async (request, response) => {
    sendApiResult(
      response,
      await loadForecast({
        locationId: request.params['locationId'] as string,
        serviceDay: request.query['serviceDay'] as string,
      }),
    );
  });
