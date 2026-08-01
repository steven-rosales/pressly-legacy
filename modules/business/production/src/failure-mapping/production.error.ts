import {
  makeAppError,
  type AppError,
  type HttpStatusCode,
} from '@pressly/errors';

export const productionError = (
  code: string,
  safeMessage: string,
  status: HttpStatusCode = 409,
  cause?: unknown,
): AppError =>
  makeAppError({
    kind:
      status === 404
        ? 'NotFoundError'
        : status >= 500
          ? 'DatabaseError'
          : 'ConflictError',
    code: code.toLowerCase(),
    message: safeMessage,
    safeMessage,
    status,
    ...(cause === undefined ? {} : { cause }),
  });

export const productionIdempotencyConflict = (): AppError =>
  productionError(
    'PRODUCTION_IDEMPOTENCY_CONFLICT',
    'The idempotency key belongs to a different production command.',
    409,
  );
