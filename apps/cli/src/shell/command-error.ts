import { validationError, type AppError } from '@pressly/errors';

export const commandError = (message: string, details?: unknown): AppError =>
  validationError({
    code: 'invalid_cli_command',
    message,
    safeMessage: message,
    ...(details === undefined ? {} : { details }),
  });
