import {
  productionRemainingDayForecastParamsSchema,
  productionRemainingDayForecastQuerySchema,
  productionRemainingDayForecastSchema,
} from './load-remaining-day-forecast.contract.mapper.ts';
import { defineRequestBoundary } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import type { RequestHandler } from 'express';
import {
  toLoadRemainingDayForecastCommand,
  toProductionRemainingDayForecastResult,
} from './load-remaining-day-forecast.contract.mapper.ts';
import type { LoadRemainingDayForecast } from './load-remaining-day-forecast.port.ts';

export const loadRemainingDayForecastBoundary = defineRequestBoundary({
  params: productionRemainingDayForecastParamsSchema,
  query: productionRemainingDayForecastQuerySchema,
});

export const makeLoadRemainingDayForecastController = (
  loadForecast: LoadRemainingDayForecast,
): RequestHandler =>
  loadRemainingDayForecastBoundary.handler(
    async ({ params, query }, { response }) => {
      sendValidatedProductionResult(
        response,
        await loadForecast(
          toLoadRemainingDayForecastCommand({ params, query }),
        ),
        {
          schema: productionRemainingDayForecastSchema,
          present: toProductionRemainingDayForecastResult,
        },
      );
    },
  );
