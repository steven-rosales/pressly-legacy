import type {
  PublishSchedulerConfigConflictFailure,
  PublishSchedulerConfigValidationFailure,
} from './types.ts';

export const schedulerConfigInvalid =
  (): PublishSchedulerConfigValidationFailure => ({
    kind: 'validation',
    classification: 'semantic',
    code: 'scheduler_config_invalid',
    message: 'Scheduler values must be positive.',
    safeMessage: 'Scheduler values must be positive.',
  });

export const publishSchedulerConfigIdempotencyConflict =
  (): PublishSchedulerConfigConflictFailure => ({
    kind: 'conflict',
    code: 'production_idempotency_conflict',
    message: 'The idempotency key belongs to a different production command.',
    safeMessage:
      'The idempotency key belongs to a different production command.',
  });
