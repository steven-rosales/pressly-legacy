import { conflictFailure } from '../failures/production-failure.factory.ts';

export const productionIdempotencyConflict = () =>
  conflictFailure({
    code: 'production_idempotency_conflict',
    message: 'The idempotency key belongs to a different production command.',
    safeMessage:
      'The idempotency key belongs to a different production command.',
  });
