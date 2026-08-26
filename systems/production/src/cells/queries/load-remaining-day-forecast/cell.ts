import { defineOperation } from '@pressly/cells';
import type { ProductionRemainingDayForecast } from './boundary.ts';
import { loadRemainingDayForecastContract } from './contract.ts';
import {
  makeExecuteLoadRemainingDayForecast,
  type LoadRemainingDayForecastDependencies,
} from './execute.ts';
import {
  loadRemainingDayForecastOperationId,
  type LoadRemainingDayForecastExpectedFailure,
  type LoadRemainingDayForecastInput,
} from './types.ts';

export const loadRemainingDayForecastCellDeclaration = defineOperation<
  LoadRemainingDayForecastInput,
  ProductionRemainingDayForecast,
  LoadRemainingDayForecastExpectedFailure
>({
  kind: 'query',
  id: loadRemainingDayForecastOperationId,
  authentication: 'none',
  contract: loadRemainingDayForecastContract,
  consistency: { transaction: 'required', concurrency: 'none' },
  surfaces: [],
  observability: { operation: 'production.load_remaining_day_forecast' },
});

export const makeLoadRemainingDayForecastCell = (
  dependencies: LoadRemainingDayForecastDependencies,
) =>
  defineOperation(
    loadRemainingDayForecastCellDeclaration,
    makeExecuteLoadRemainingDayForecast(dependencies),
  );
