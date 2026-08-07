import { Router, type RequestHandler } from 'express';
import { makeLoadRemainingDayForecastController } from './load-remaining-day-forecast.controller.ts';
import type { LoadRemainingDayForecast } from './load-remaining-day-forecast.port.ts';

export const makeLoadRemainingDayForecastRoute = (input: {
  loadForecast: LoadRemainingDayForecast;
  authenticate: RequestHandler;
  authorize: RequestHandler;
}): Router => {
  const router = Router();
  const controller = makeLoadRemainingDayForecastController(input.loadForecast);
  router.get(
    '/production/locations/:locationId/forecast',
    input.authenticate,
    controller.validate,
    input.authorize,
    controller.handle,
  );
  return router;
};
