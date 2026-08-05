import {
  productionRemainingDayForecastParamsSchema,
  productionRemainingDayForecastQuerySchema,
  productionRemainingDayForecastSchema,
} from '@pressly/contracts/production';
import { defineValidatedController } from '@pressly/http/express';
import { sendValidatedProductionResult } from '../../../foundations/adapters/errors/production-api-result.adapter.ts';
import {
  toLoadRemainingDayForecastCommand,
  toProductionRemainingDayForecastResult,
} from './load-remaining-day-forecast.contract.mapper.ts';
import type { LoadRemainingDayForecast } from './load-remaining-day-forecast.port.ts';

export const makeLoadRemainingDayForecastController = (
  loadForecast: LoadRemainingDayForecast,
) =>
  defineValidatedController({
    request: {
      params: productionRemainingDayForecastParamsSchema,
      query: productionRemainingDayForecastQuerySchema,
    },
    handle: async ({ params, query }, { response }) => {
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
  });
