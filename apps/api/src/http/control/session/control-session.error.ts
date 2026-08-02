import { authError, permissionError, type AppError } from '@pressly/errors';

export const controlUnauthorized = (input: {
  code: string;
  message: string;
}): AppError =>
  authError({
    code: input.code,
    message: input.message,
    safeMessage: 'Authentication is required.',
  });

export const controlForbidden = (input: {
  code: string;
  message: string;
  safeMessage?: string;
}): AppError =>
  permissionError({
    code: input.code,
    message: input.message,
    safeMessage: input.safeMessage ?? 'This Control request was rejected.',
  });
