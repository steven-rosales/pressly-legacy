import type {
  AcceptScheduleConflictCode,
  AcceptScheduleConflictFailure,
  AcceptScheduleNotFoundFailure,
} from './types.ts';

export const acceptScheduleConflict = (
  code: AcceptScheduleConflictCode,
  message: string,
  safeMessage = message,
): AcceptScheduleConflictFailure => ({
  kind: 'conflict',
  code,
  message,
  safeMessage,
});

export const acceptScheduleIdempotencyConflict =
  (): AcceptScheduleConflictFailure =>
    acceptScheduleConflict(
      'production_idempotency_conflict',
      'The idempotency key belongs to a different production command.',
    );

export const acceptScheduleNotFound = (): AcceptScheduleNotFoundFailure => ({
  kind: 'not_found',
  code: 'schedule_not_found',
  message: 'The schedule proposal was not found.',
  safeMessage: 'The schedule proposal was not found.',
});

export const acceptScheduleAlreadyStarted = (): AcceptScheduleConflictFailure =>
  acceptScheduleConflict(
    'production_shift_already_started',
    'A production run already exists for this shift.',
  );

export const acceptScheduleNotDraft = (): AcceptScheduleConflictFailure =>
  acceptScheduleConflict(
    'schedule_not_draft',
    'Only a draft schedule may be accepted.',
  );

export const acceptScheduleCasConflict = (): AcceptScheduleConflictFailure =>
  acceptScheduleConflict(
    'production_schedule_already_accepted',
    'Schedule was already accepted.',
    'Production state changed. Refresh and try again.',
  );
