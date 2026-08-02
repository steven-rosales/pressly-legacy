import { authError, permissionError, type AppError } from '@pressly/errors';

export const processorUnauthorized = (input: {
  code: string;
  message: string;
  safeMessage?: string;
}): AppError =>
  authError({
    code: input.code,
    message: input.message,
    safeMessage: input.safeMessage ?? 'Authentication is required.',
  });

export const processorForbidden = (input: {
  code: string;
  message: string;
  safeMessage: string;
}): AppError =>
  permissionError({
    code: input.code,
    message: input.message,
    safeMessage: input.safeMessage,
  });
