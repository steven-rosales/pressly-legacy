import { authError, permissionError } from '@pressly/errors/factories';
import type { AppError } from '@pressly/errors/app-error';

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
