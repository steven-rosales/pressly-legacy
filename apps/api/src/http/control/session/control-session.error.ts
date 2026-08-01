import { makeAppError, type AppError } from '@pressly/errors';

export const controlUnauthorized = (input: {
  code: string;
  message: string;
}): AppError =>
  makeAppError({
    kind: 'PermissionError',
    code: input.code,
    message: input.message,
    safeMessage: 'Authentication is required.',
    status: 401,
  });

export const controlForbidden = (input: {
  code: string;
  message: string;
  safeMessage?: string;
}): AppError =>
  makeAppError({
    kind: 'PermissionError',
    code: input.code,
    message: input.message,
    safeMessage: input.safeMessage ?? 'This Control request was rejected.',
    status: 403,
  });
