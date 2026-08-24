import type { CellOutcome } from '@pressly/cells';
import type { ProductionRemainingDayForecast } from './boundary.ts';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import {
  loadRemainingDayForecastInvalidServiceDay,
  loadRemainingDayForecastLocationNotFound,
  loadRemainingDayForecastScopeTooLarge,
} from './failures.ts';
import { projectRemainingDayForecast } from './project.ts';
import type {
  LoadRemainingDayForecastExpectedFailure,
  LoadRemainingDayForecastInput,
  LoadRemainingDayForecastRepository,
  RemainingDayForecastPolicy,
  RemainingDayForecastScheduler,
} from './types.ts';
import { remainingDayForecastRowLimit } from './types.ts';

export type LoadRemainingDayForecastDependencies = Readonly<{
  repo: LoadRemainingDayForecastRepository;
  clock: Readonly<{ now: () => Date }>;
  policy: RemainingDayForecastPolicy;
  scheduler: RemainingDayForecastScheduler;
}>;

export type ExecuteLoadRemainingDayForecast = (
  input: LoadRemainingDayForecastInput,
) => Promise<
  CellOutcome<
    ProductionRemainingDayForecast,
    LoadRemainingDayForecastExpectedFailure
  >
>;

const failure = (value: LoadRemainingDayForecastExpectedFailure) => ({
  kind: 'failure' as const,
  failure: value,
});

export const makeExecuteLoadRemainingDayForecast = (
  dependencies: LoadRemainingDayForecastDependencies,
): ExecuteLoadRemainingDayForecast =>
  async function loadRemainingDayForecast(input) {
    let asOf: Date;
    let loaded: Awaited<ReturnType<typeof dependencies.repo.load>>;
    try {
      asOf = dependencies.clock.now();
      loaded = await dependencies.repo.load({
        locationId: input.locationId,
        serviceDay: input.serviceDay,
        asOf,
        rowLimit: remainingDayForecastRowLimit,
      });
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'production_forecast_load_failed',
          message: 'The remaining-day forecast could not be loaded.',
          safeMessage: 'The remaining-day forecast could not be loaded.',
          status: 503,
          cause,
        }),
      );
    }

    if (loaded === null)
      return failure(loadRemainingDayForecastLocationNotFound());
    if (loaded === 'invalid_service_day')
      return failure(loadRemainingDayForecastInvalidServiceDay());
    if (loaded === 'scope_too_large')
      return failure(loadRemainingDayForecastScopeTooLarge());

    const projected = projectRemainingDayForecast({
      readModel: loaded,
      asOf,
      policy: dependencies.policy,
      scheduler: dependencies.scheduler,
    });
    return projected.kind === 'failure'
      ? failure(projected.failure)
      : { kind: 'success', value: projected.value };
  };
