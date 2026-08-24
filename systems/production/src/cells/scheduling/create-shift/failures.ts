import type {
  CreateShiftConflictFailure,
  CreateShiftValidationFailure,
} from './types.ts';

export const createShiftWindowInvalid = (): CreateShiftValidationFailure => ({
  kind: 'validation',
  classification: 'semantic',
  code: 'production_shift_window_invalid',
  message: 'Shift end must be after shift start.',
  safeMessage: 'Shift end must be after shift start.',
});

export const createShiftIdempotencyConflict =
  (): CreateShiftConflictFailure => ({
    kind: 'conflict',
    code: 'production_idempotency_conflict',
    message: 'The idempotency key belongs to a different production command.',
    safeMessage:
      'The idempotency key belongs to a different production command.',
  });
