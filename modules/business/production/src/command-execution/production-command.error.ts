import { conflictError, type AppError } from '@pressly/errors';

export const productionIdempotencyConflict = (): AppError =>
  conflictError({
    code: 'production_idempotency_conflict',
    message: 'The idempotency key belongs to a different production command.',
    safeMessage:
      'The idempotency key belongs to a different production command.',
  });
