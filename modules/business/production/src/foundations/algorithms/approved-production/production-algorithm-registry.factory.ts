import { forecastDemand } from '../demand-forecast-v1/forecast-demand.algorithm.ts';
import { proposeOnlinePlacement } from '../online-stable-insertion-v1/online-placement.algorithm.ts';
import { proposeSchedule } from '../fixed-pulse-ffd-v2/propose-schedule.algorithm.ts';
import { makeRemainingDayForecastProjection } from '../remaining-day-forecast-v1/remaining-day-forecast.algorithm.ts';
import type {
  DemandForecastInput,
  DemandForecastOutput,
  SchedulingInput,
  SchedulingOutput,
} from '../../language/scheduling/production-scheduling.model.ts';
import type {
  OnlinePlacementInput,
  OnlinePlacementResult,
} from '../../language/scheduling/online-placement.model.ts';
import type {
  RemainingDayForecastInput,
  RemainingDayForecastOutput,
} from '../../language/scheduling/remaining-day-forecast.model.ts';

export const productionAlgorithmVersions = Object.freeze({
  schedule: Object.freeze(['fixed-pulse-ffd-v2'] as const),
  historicalSchedule: Object.freeze(['fixed-pulse-ffd-v1'] as const),
  demandForecast: Object.freeze(['fixed-pulse-demand-outlook-v1'] as const),
  onlinePlacement: Object.freeze(['online-stable-insertion-v1'] as const),
  remainingDayForecast: Object.freeze(['online-stable-insertion-v1'] as const),
});

/**
 * Compiles the complete, immutable set of algorithms approved for Production.
 * A persisted v1 schedule remains readable history, while new executable
 * schedules continue to use fixed-pulse-ffd-v2 exactly as before.
 */
export type ProductionAlgorithmRegistry = Readonly<{
  versions: typeof productionAlgorithmVersions;
  schedules: Readonly<{
    'fixed-pulse-ffd-v2': (input: SchedulingInput) => SchedulingOutput;
  }>;
  demandForecasts: Readonly<{
    'fixed-pulse-demand-outlook-v1': (
      input: DemandForecastInput,
    ) => DemandForecastOutput;
  }>;
  onlinePlacements: Readonly<{
    'online-stable-insertion-v1': (
      input: OnlinePlacementInput,
    ) => OnlinePlacementResult;
  }>;
  remainingDayForecasts: Readonly<{
    'online-stable-insertion-v1': (
      input: RemainingDayForecastInput,
    ) => RemainingDayForecastOutput;
  }>;
  forecastDemand: (input: DemandForecastInput) => DemandForecastOutput;
  propose: (input: SchedulingInput) => SchedulingOutput;
  proposeOnlinePlacement: (
    input: OnlinePlacementInput,
  ) => OnlinePlacementResult;
  projectRemainingDayForecast: (
    input: RemainingDayForecastInput,
  ) => RemainingDayForecastOutput;
}>;

export const defineProductionAlgorithmRegistry =
  (): ProductionAlgorithmRegistry => {
    const projectRemainingDayForecast = makeRemainingDayForecastProjection(
      proposeOnlinePlacement,
    );

    return Object.freeze({
      versions: productionAlgorithmVersions,
      schedules: Object.freeze({
        'fixed-pulse-ffd-v2': proposeSchedule,
      }),
      demandForecasts: Object.freeze({
        'fixed-pulse-demand-outlook-v1': forecastDemand,
      }),
      onlinePlacements: Object.freeze({
        'online-stable-insertion-v1': proposeOnlinePlacement,
      }),
      remainingDayForecasts: Object.freeze({
        'online-stable-insertion-v1': projectRemainingDayForecast,
      }),
      forecastDemand,
      propose: proposeSchedule,
      proposeOnlinePlacement,
      projectRemainingDayForecast,
    });
  };
