import type { AppError } from './app-error.js';

export type PresentAppErrorOptions = Readonly<{
  diagnostics?: boolean;
}>;

export const presentAppError = (
  error: AppError,
  options: PresentAppErrorOptions = {},
): string => {
  if (options.diagnostics !== true) return error.safeMessage;

  return [
    error.safeMessage,
    '',
    `code: ${error.code}`,
    `kind: ${error.kind}`,
    `status: ${error.status}`,
    `message: ${error.message}`,
    ...(error.traceId === undefined ? [] : [`traceId: ${error.traceId}`]),
  ].join('\n');
};
