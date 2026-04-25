import { makeAppError, type AppError } from './app-error.js';

export const validationError = (input: {
  code: string;
  message: string;
  safeMessage?: string;
  details?: unknown;
}): AppError =>
  makeAppError({
    kind: 'ValidationError',
    code: input.code,
    message: input.message,
    safeMessage: input.safeMessage ?? 'Invalid request input.',
    status: 400,
    ...(input.details === undefined ? {} : { details: input.details }),
  });

export const notFoundError = (input: {
  code: string;
  message: string;
  safeMessage: string;
}): AppError =>
  makeAppError({
    kind: 'NotFoundError',
    code: input.code,
    message: input.message,
    safeMessage: input.safeMessage ?? 'The requested resource was not found.',
    status: 404,
  });

export const permissionError = (input: {
  code: string;
  message: string;
  safeMessage?: string;
}): AppError =>
  makeAppError({
    kind: 'PermissionError',
    code: input.code,
    message: input.message,
    safeMessage: input.safeMessage ?? 'You do not have permission to do this.',
    status: 403,
  });

export const conflictError = (input: {
  code: string;
  message: string;
  safeMessage?: string;
  details?: unknown;
}): AppError =>
  makeAppError({
    kind: 'ConflictError',
    code: input.code,
    message: input.message,
    safeMessage:
      input.safeMessage ?? 'The request conflicts with current state.',
    status: 409,
    ...(input.details === undefined ? {} : { details: input.details }),
  });
