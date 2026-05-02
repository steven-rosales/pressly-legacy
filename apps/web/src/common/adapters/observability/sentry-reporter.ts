'use client';

import * as Sentry from '@sentry/nextjs';
import { normalizeUnknownError, type AppError } from '@pressly/errors';
import type { ErrorReporter, ErrorReportContext } from '@pressly/metrics';

const setAppErrorContext = (appError: AppError): void => {
  Sentry.setTag('error.kind', appError.kind);
  Sentry.setTag('error.code', appError.code);
  Sentry.setTag('error.status', String(appError.status));

  Sentry.setContext('app_error', {
    kind: appError.kind,
    code: appError.code,
    status: appError.status,
    safeMessage: appError.safeMessage,
    details: appError.details,
  });
};

const setReportContext = (context: ErrorReportContext): void => {
  Sentry.setTag('source', context.source);

  if (context.operation !== undefined)
    Sentry.setTag('operation', context.operation);
  if (context.requestId !== undefined)
    Sentry.setTag('request_id', context.requestId);
  if (context.traceId !== undefined) Sentry.setTag('trace_id', context.traceId);
  if (context.route !== undefined) Sentry.setTag('route', context.route);

  for (const [key, value] of Object.entries(context.tags ?? {})) {
    Sentry.setTag(key, value);
  }

  if (context.actorId !== undefined) Sentry.setUser({ id: context.actorId });

  if (context.extra !== undefined) Sentry.setContext('extra', context.extra);
};

export const makeSentryErrorReporter = (): ErrorReporter => ({
  capture: (error, context) => {
    const appError = normalizeUnknownError(error);

    Sentry.withScope((scope) => {
      setReportContext(context);
      setAppErrorContext(appError);

      scope.setLevel(appError.status >= 500 ? 'error' : 'warning');

      Sentry.captureException(appError);
    });
  },

  shutdown: async () => undefined,
});
