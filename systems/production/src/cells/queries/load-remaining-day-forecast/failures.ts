import type {
  LoadRemainingDayForecastExecutionInvalid,
  LoadRemainingDayForecastInvalidServiceDay,
  LoadRemainingDayForecastLocationNotFound,
  LoadRemainingDayForecastScopeTooLarge,
} from './types.ts';

export const loadRemainingDayForecastLocationNotFound =
  (): LoadRemainingDayForecastLocationNotFound => ({
    tag: 'ProductionFailure',
    kind: 'not_found',
    code: 'production_location_not_found',
    message: 'The active production location was not found.',
    safeMessage: 'The active production location was not found.',
  });

export const loadRemainingDayForecastInvalidServiceDay =
  (): LoadRemainingDayForecastInvalidServiceDay => ({
    tag: 'ProductionFailure',
    kind: 'validation',
    classification: 'malformed',
    code: 'production_forecast_service_day_invalid',
    message: 'The requested service day is invalid for this location.',
    safeMessage: 'The requested service day is invalid for this location.',
  });

export const loadRemainingDayForecastScopeTooLarge =
  (): LoadRemainingDayForecastScopeTooLarge => ({
    tag: 'ProductionFailure',
    kind: 'conflict',
    code: 'production_forecast_scope_too_large',
    message: 'The remaining-day forecast exceeds the supported work limit.',
    safeMessage: 'The remaining-day forecast exceeds the supported work limit.',
  });

export const loadRemainingDayForecastExecutionInvalid = (
  message: string,
): LoadRemainingDayForecastExecutionInvalid => ({
  tag: 'ProductionFailure',
  kind: 'conflict',
  code: 'production_order_execution_state_invalid',
  message,
  safeMessage: message,
});
