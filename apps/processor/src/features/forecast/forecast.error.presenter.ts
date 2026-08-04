import type { TFunction } from 'i18next';
import { isRequestFailure } from '@/ports/request.error';

export const presentForecastError = (cause: unknown, t: TFunction): string => {
  if (!isRequestFailure(cause)) return t('forecast.errors.loadFailed');

  switch (cause.code.toLowerCase()) {
    case 'production_location_not_found':
    case 'production_location_unavailable':
      return t('forecast.errors.locationUnavailable');
    case 'production_forecast_service_day_invalid':
      return t('forecast.errors.serviceDayInvalid');
    case 'production_forecast_scope_too_large':
      return t('forecast.errors.scopeTooLarge');
    case 'production_forecast_state_inconsistent':
      return t('forecast.errors.stateInconsistent');
  }

  if (cause.requestKind === 'unauthorized')
    return t('forecast.errors.unauthorized');
  if (cause.requestKind === 'forbidden') return t('forecast.errors.forbidden');
  if (cause.requestKind === 'unavailable')
    return t('forecast.errors.unavailable');
  if (cause.requestKind === 'invalid_response')
    return t('forecast.errors.invalidResponse');
  return t('forecast.errors.loadFailed');
};
