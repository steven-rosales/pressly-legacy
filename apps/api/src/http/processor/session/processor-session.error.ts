import type { AppError } from '@pressly/errors/app-error';
import { authError, permissionError } from '@pressly/errors/factories';

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
