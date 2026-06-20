import type { AppError } from './app-error.js';

export const presentAppError = (error: AppError): string =>
  [
    error.safeMessage,
    '',
    `code: ${error.code}`,
    `kind: ${error.kind}`,
    `message: ${error.message}`,
  ].join('\n');
