import type {
  UpdateShiftConflictFailure,
  UpdateShiftExpectedFailure,
  UpdateShiftNotFoundFailure,
  UpdateShiftValidationFailure,
} from './types.ts';

export const updateShiftWindowInvalid = (): UpdateShiftValidationFailure => ({
  kind: 'validation',
  classification: 'semantic',
  code: 'production_shift_window_invalid',
  message: 'Shift end must be after shift start.',
  safeMessage: 'Shift end must be after shift start.',
});

export const updateShiftIdempotencyConflict =
  (): UpdateShiftConflictFailure => ({
    kind: 'conflict',
    code: 'production_idempotency_conflict',
    message: 'The idempotency key belongs to a different production command.',
    safeMessage:
      'The idempotency key belongs to a different production command.',
  });

export const updateShiftNotFound = (): UpdateShiftNotFoundFailure => ({
  kind: 'not_found',
  code: 'production_shift_not_found',
  message: 'The production shift was not found.',
  safeMessage: 'The production shift was not found.',
});

export const updateShiftVersionConflict = (): UpdateShiftConflictFailure => ({
  kind: 'conflict',
  code: 'production_shift_version_conflict',
  message: 'The production shift changed before it could be updated.',
  safeMessage: 'The production shift changed before it could be updated.',
});

export const updateShiftLockedVersionConflict =
  (): UpdateShiftConflictFailure => ({
    kind: 'conflict',
    code: 'production_shift_version_conflict',
    message: 'Locked production shift changed unexpectedly.',
    safeMessage: 'Locked production shift changed unexpectedly.',
  });

export const updateShiftClosed = (): UpdateShiftConflictFailure => ({
  kind: 'conflict',
  code: 'production_shift_closed',
  message: 'A closed production shift cannot be updated.',
  safeMessage: 'A closed production shift cannot be updated.',
});

export const updateShiftAlreadyStarted = (): UpdateShiftConflictFailure => ({
  kind: 'conflict',
  code: 'production_shift_already_started',
  message: 'A production run already exists for this shift.',
  safeMessage: 'A production run already exists for this shift.',
});

export const updateShiftCurrentPlanStateInvalid =
  (): UpdateShiftConflictFailure => ({
    kind: 'conflict',
    code: 'schedule_current_plan_state_invalid',
    message: 'The current schedule revision cannot be superseded.',
    safeMessage: 'The current schedule revision cannot be superseded.',
  });

export const updateShiftScheduleVersionConflict =
  (): UpdateShiftConflictFailure => ({
    kind: 'conflict',
    code: 'production_shift_schedule_version_conflict',
    message: 'Current schedule revision changed unexpectedly.',
    safeMessage: 'Production state changed. Refresh and try again.',
  });

const conflictCodes = new Set<UpdateShiftConflictFailure['code']>([
  'production_idempotency_conflict',
  'production_shift_already_started',
  'production_shift_closed',
  'production_shift_schedule_version_conflict',
  'production_shift_version_conflict',
  'schedule_current_plan_state_invalid',
]);

export const isUpdateShiftExpectedFailure = (
  value: unknown,
): value is UpdateShiftExpectedFailure => {
  if (typeof value !== 'object' || value === null) return false;
  const failure = value as Readonly<Record<string, unknown>>;
  if (
    typeof failure['code'] !== 'string' ||
    typeof failure['message'] !== 'string' ||
    typeof failure['safeMessage'] !== 'string'
  )
    return false;
  if (failure['kind'] === 'not_found')
    return failure['code'] === 'production_shift_not_found';
  if (failure['kind'] === 'validation')
    return (
      failure['classification'] === 'semantic' &&
      failure['code'] === 'production_shift_window_invalid'
    );
  return (
    failure['kind'] === 'conflict' &&
    conflictCodes.has(failure['code'] as UpdateShiftConflictFailure['code'])
  );
};
