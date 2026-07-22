import { makeAppError, type AppError } from '@pressly/errors';

export const processorUnauthorized = (input: {
  code: string;
  message: string;
  safeMessage?: string;
}): AppError =>
  makeAppError({
    kind: 'AuthError',
    code: input.code,
    message: input.message,
    safeMessage: input.safeMessage ?? 'Authentication is required.',
    status: 401,
  });

export const processorForbidden = (input: {
  code: string;
  message: string;
  safeMessage: string;
}): AppError =>
  makeAppError({
    kind: 'PermissionError',
    code: input.code,
    message: input.message,
    safeMessage: input.safeMessage,
    status: 403,
  });
