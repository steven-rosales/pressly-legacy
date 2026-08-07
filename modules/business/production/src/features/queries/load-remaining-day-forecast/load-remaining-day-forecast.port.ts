import type { ProductionFeatureFailure } from '../../../foundations/language/failures/production-feature.failure.ts';
import type { Result } from '@pressly/kernel';
import type {
  RemainingDayForecastInput,
  RemainingDayForecastOutput,
} from '../../../foundations/language/scheduling/remaining-day-forecast.model.ts';
import type {
  LoadRemainingDayForecastCommand,
  ProductionRemainingDayForecast,
  RemainingDayForecastReadModel,
} from './load-remaining-day-forecast.model.ts';

export type LoadRemainingDayForecast = (
  command: LoadRemainingDayForecastCommand,
) => Promise<Result<ProductionRemainingDayForecast, ProductionFeatureFailure>>;

export type LoadRemainingDayForecastRepository = Readonly<{
  load: (input: {
    locationId: string;
    serviceDay: string;
    asOf: Date;
    rowLimit: number;
  }) => Promise<
    | RemainingDayForecastReadModel
    | 'scope_too_large'
    | 'invalid_service_day'
    | null
  >;
}>;

export type ProjectRemainingDayForecast = (
  input: RemainingDayForecastInput,
) => RemainingDayForecastOutput;
