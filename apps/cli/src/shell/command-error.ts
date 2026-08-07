import { type AppError } from '@pressly/errors/app-error';
import { validationError } from '@pressly/errors/factories';

export const commandError = (message: string, details?: unknown): AppError =>
  validationError({
    code: 'invalid_cli_command',
    message,
    safeMessage: message,
    ...(details === undefined ? {} : { details }),
  });
