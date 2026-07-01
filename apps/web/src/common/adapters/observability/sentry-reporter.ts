import * as Sentry from '@sentry/nextjs';
import { normalizeUnknownError, type AppError } from '@pressly/errors';
import { redactLogFields } from '@pressly/logging';
import type { ErrorReporter, ErrorReportContext } from '@pressly/metrics';

const toSentryContext = (value: unknown): Record<string, unknown> => {
  const redacted = redactLogFields(value);

  if (
    typeof redacted === 'object' &&
    redacted !== null &&
    !Array.isArray(redacted)
  )
    return redacted as Record<string, unknown>;

  return { value: redacted };
};

const setAppErrorContext = (scope: Sentry.Scope, appError: AppError): void => {
  scope.setTag('error.kind', appError.kind);
  scope.setTag('error.code', appError.code);
  scope.setTag('error.status', String(appError.status));

  scope.setContext('app_error', {
    kind: appError.kind,
    code: appError.code,
    status: appError.status,
    safeMessage: appError.safeMessage,
    details: redactLogFields(appError.details),
  });
};

const setReportContext = (
  scope: Sentry.Scope,
  context: ErrorReportContext,
): void => {
  scope.setTag('source', context.source);

  if (context.operation !== undefined)
    scope.setTag('operation', context.operation);
  if (context.requestId !== undefined)
    scope.setTag('request_id', context.requestId);
  if (context.traceId !== undefined) scope.setTag('trace_id', context.traceId);
  if (context.route !== undefined) scope.setTag('route', context.route);

  for (const [key, value] of Object.entries(context.tags ?? {})) {
    scope.setTag(key, value);
  }

  if (context.actorId !== undefined) scope.setUser({ id: context.actorId });

  if (context.extra !== undefined)
    scope.setContext('extra', toSentryContext(context.extra));
};

export const makeSentryErrorReporter = (): ErrorReporter => ({
  capture: (error, context) => {
    const appError = normalizeUnknownError(error);

    Sentry.withScope((scope) => {
      setReportContext(scope, context);
      setAppErrorContext(scope, appError);

      scope.setLevel(appError.status >= 500 ? 'error' : 'warning');

      Sentry.captureException(appError);
    });
  },

  shutdown: async () => undefined,
});
