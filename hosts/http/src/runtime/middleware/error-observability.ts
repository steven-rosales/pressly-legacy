import type { AppError } from '@pressly/errors/app-error';
import { redactLogFields } from '@pressly/logging';
import {
  attemptObservation,
  decideObservation,
  type ErrorReportContext,
  type ObservationDecision,
} from '@pressly/observability';
import type { Request } from 'express';
import type { HttpBoundaryRuntime } from '../types.ts';
import {
  logObservation,
  toObservationLogFields,
} from '../observability/observation-log.ts';
import { normalizedApiRoute } from './route.ts';

const reportContext = (input: {
  appError: AppError;
  decision: ObservationDecision;
  request: Request;
  requestId?: string | undefined;
}): ErrorReportContext => ({
  source: 'api',
  operation: `${input.request.method} ${normalizedApiRoute(input.request)}`,
  ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
  traceId: input.appError.traceId ?? input.requestId,
  route: normalizedApiRoute(input.request),
  tags: {
    reason: input.decision.reason,
    error_kind: input.appError.kind,
    error_code: input.appError.code,
    status: String(input.appError.status),
  },
  extra: {
    details: redactLogFields(input.appError.details),
  },
});

export const observeApiError = (
  runtime: HttpBoundaryRuntime,
  input: {
    appError: AppError;
    request: Request;
    requestId?: string | undefined;
  },
): ObservationDecision => {
  const route = normalizedApiRoute(input.request);
  const decision = decideObservation({
    kind: 'error',
    source: 'api',
    rail: 'http',
    route,
    operation: `${input.request.method} ${route}`,
    error: {
      kind: input.appError.kind,
      code: input.appError.code,
      status: input.appError.status,
      traceId: input.appError.traceId ?? input.requestId,
    },
  });

  const logLevel = decision.logLevel;
  if (logLevel !== undefined)
    attemptObservation(() =>
      logObservation(
        runtime.logger,
        logLevel,
        'api.error.observed',
        toObservationLogFields({
          kind: input.appError.kind,
          code: input.appError.code,
          status: input.appError.status,
          reason: decision.reason,
          requestId: input.requestId,
          method: input.request.method,
          route,
          details: input.appError.details,
        }),
      ),
    );

  const counter = decision.counter;
  if (counter !== undefined)
    attemptObservation(() =>
      runtime.observability.counters.increment(counter, {
        reason: decision.reason,
        status: String(input.appError.status),
        route,
      }),
    );

  if (decision.report)
    attemptObservation(() =>
      runtime.observability.errors.capture(
        input.appError,
        reportContext({
          appError: input.appError,
          decision,
          request: input.request,
          requestId: input.requestId,
        }),
      ),
    );

  return decision;
};
