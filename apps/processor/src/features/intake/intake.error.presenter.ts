import type { TFunction } from 'i18next';
import { isRequestFailure } from '@/ports/request.error';

export const presentIntakeError = (
  cause: unknown,
  t: TFunction,
  operation: 'load' | 'mutation' = 'mutation',
): string => {
  if (!isRequestFailure(cause))
    return t(
      operation === 'load'
        ? 'intake.errors.loadFailed'
        : 'intake.errors.recordFailed',
    );

  switch (cause.code.toLowerCase()) {
    case 'production_order_version_conflict':
      return t('intake.errors.changed');
    case 'production_order_intake_state_invalid':
      return t('intake.errors.noLongerPending');
    case 'production_order_not_found':
      return t('intake.errors.orderMissing');
    case 'order_bag_count_invalid':
      return t('intake.errors.bagCountRejected');
    case 'production_admission_already_committed':
      return t('intake.errors.admissionCommitted');
    case 'production_admission_source_withdrawn':
      return t('intake.errors.sourceWithdrawn');
    case 'production_admission_source_now_released':
    case 'production_admission_already_released_by_source':
      return t('intake.errors.sourceAlreadyReleased');
    case 'production_admission_override_not_found':
    case 'production_admission_release_state_invalid':
    case 'production_admission_already_released':
      return t('intake.errors.admissionChanged');
  }

  if (cause.requestKind === 'unauthorized')
    return t('intake.errors.unauthorized');
  if (cause.requestKind === 'forbidden') return t('intake.errors.forbidden');
  if (cause.requestKind === 'unavailable')
    return t('intake.errors.unavailable');
  if (cause.requestKind === 'invalid_response')
    return t('intake.errors.invalidResponse');
  if (cause.requestKind === 'conflict') return t('intake.errors.changed');
  return t(
    operation === 'load'
      ? 'intake.errors.loadFailed'
      : 'intake.errors.recordFailed',
  );
};
