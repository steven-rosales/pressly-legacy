import {
  makeAppError,
  type AppError,
  type HttpStatusCode,
} from '@pressly/errors';

export const userError = (
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
          : status === 400
            ? 'ValidationError'
            : 'ConflictError',
    code: code.toLowerCase(),
    message: safeMessage,
    safeMessage,
    status,
    ...(cause === undefined ? {} : { cause }),
  });
