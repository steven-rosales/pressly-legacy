import { Router, type RequestHandler } from 'express';
import {
  loadRemainingDayForecastBoundary,
  makeLoadRemainingDayForecastController,
} from './load-remaining-day-forecast.controller.ts';
import type { LoadRemainingDayForecast } from './load-remaining-day-forecast.usecase.ts';

export const makeLoadRemainingDayForecastRoute = (input: {
  loadForecast: LoadRemainingDayForecast;
  authenticate: RequestHandler;
  authorize: RequestHandler;
}): Router => {
  const router = Router();
  router.get(
    '/production/locations/:locationId/forecast',
    input.authenticate,
    loadRemainingDayForecastBoundary.validate,
    input.authorize,
    makeLoadRemainingDayForecastController(input.loadForecast),
  );
  return router;
};
