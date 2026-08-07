import { mapUnknownError, type AppError } from '@pressly/errors/app-error';
import { invariantViolationError } from '@pressly/errors/factories';

const invariantFailure = (
  code: string,
  message: string,
  cause?: unknown,
): AppError =>
  invariantViolationError({
    code: code.toLowerCase(),
    message,
    safeMessage: 'Stored order data is inconsistent.',
    ...(cause === undefined ? {} : { cause }),
  });

export const orderInvariantError = (
  code: string,
  message: string,
  cause?: unknown,
): AppError =>
  cause === undefined
    ? invariantFailure(code, message)
    : mapUnknownError(cause, (unknownCause) =>
        invariantFailure(code, message, unknownCause),
      );
