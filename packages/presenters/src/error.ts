import type { AppError } from '@pressly/errors';

export const presentAppError = (error: AppError): string =>
  [
    error.safeMessage,
    '',
    `code: ${error.code}`,
    `kind: ${error.kind}`,
    `message: ${error.message}`,
  ].join('\n');
