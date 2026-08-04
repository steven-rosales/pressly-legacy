import type { TFunction } from 'i18next';
import { isRequestFailure } from '@/ports/request.error';

export type HistoryErrorOperation = 'list' | 'detail' | 'restore';

const fallbackMessage = (
  operation: HistoryErrorOperation,
  t: TFunction,
): string =>
  operation === 'restore'
    ? t('orderResolution.history.restore.errorTitle')
    : operation === 'detail'
      ? t('history.errors.detailFailed')
      : t('history.errors.loadFailed');

export const presentHistoryError = (
  cause: unknown,
  operation: HistoryErrorOperation,
  t: TFunction,
): string => {
  if (!isRequestFailure(cause)) return fallbackMessage(operation, t);

  switch (cause.code.toLowerCase()) {
    case 'production_history_cursor_invalid':
      return t('history.errors.cursorInvalid');
    case 'production_history_run_not_found':
    case 'production_run_not_found':
      return t('history.errors.runNotFound');
    case 'production_location_not_found':
    case 'production_location_unavailable':
      return t('history.errors.locationUnavailable');
    case 'production_order_version_conflict':
    case 'production_order_resolution_transition_invalid':
    case 'production_order_resolution_state_conflict':
      return t('orderResolution.history.restore.staleDescription');
  }

  if (cause.requestKind === 'unauthorized')
    return t('history.errors.unauthorized');
  if (cause.requestKind === 'forbidden') return t('history.errors.forbidden');
  if (cause.requestKind === 'unavailable')
    return t('history.errors.unavailable');
  if (cause.requestKind === 'invalid_response')
    return t('history.errors.invalidResponse');
  return fallbackMessage(operation, t);
};
