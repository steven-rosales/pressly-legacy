import type { AppError } from '@pressly/errors';
import {
  decideObservation,
  type ErrorReportContext,
  type ObservationDecision,
  type ObservationLogLevel,
} from '@pressly/metrics';
import { redactLogFields, type Logger, type LogFields } from '@pressly/logging';
import type { Request } from 'express';
import type { ApiRuntime } from '../runtime/runtime.ts';
import { normalizedApiRoute } from './api-route.ts';

const toLogFields = (fields: Readonly<Record<string, unknown>>): LogFields =>
  redactLogFields(fields) as LogFields;

const logWithLevel = (
  logger: Logger,
  level: ObservationLogLevel,
  message: string,
  fields: LogFields,
): void => {
  if (level === 'debug') logger.debug(message, fields);
  if (level === 'info') logger.info(message, fields);
  if (level === 'warn') logger.warn(message, fields);
  if (level === 'error') logger.error(message, fields);
  if (level === 'fatal') logger.fatal(message, fields);
};

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
  runtime: ApiRuntime,
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

  if (decision.logLevel !== undefined)
    logWithLevel(
      runtime.logger,
      decision.logLevel,
      'api.error.observed',
      toLogFields({
        kind: input.appError.kind,
        code: input.appError.code,
        status: input.appError.status,
        reason: decision.reason,
        requestId: input.requestId,
        method: input.request.method,
        route,
        details: input.appError.details,
      }),
    );

  if (decision.counter !== undefined)
    runtime.observability.counters.increment(decision.counter, {
      reason: decision.reason,
      status: String(input.appError.status),
      route,
    });

  if (decision.report)
    runtime.observability.errors.capture(
      input.appError,
      reportContext({
        appError: input.appError,
        decision,
        request: input.request,
        requestId: input.requestId,
      }),
    );

  return decision;
};

export const observeApiRuntimeFailure = (
  runtime: Pick<ApiRuntime, 'logger' | 'observability'>,
  input: {
    error: unknown;
    phase: 'startup' | 'server';
    operation: string;
  },
): ObservationDecision => {
  const decision = decideObservation({
    kind: 'runtime_failure',
    source: 'api',
    phase: input.phase,
    operation: input.operation,
  });

  if (decision.logLevel !== undefined)
    logWithLevel(
      runtime.logger,
      decision.logLevel,
      'api.runtime.failure',
      toLogFields({
        phase: input.phase,
        operation: input.operation,
        reason: decision.reason,
        error: input.error,
      }),
    );

  if (decision.counter !== undefined)
    runtime.observability.counters.increment(decision.counter, {
      phase: input.phase,
      operation: input.operation,
      reason: decision.reason,
    });

  if (decision.report)
    runtime.observability.errors.capture(input.error, {
      source: 'api',
      operation: input.operation,
      tags: {
        phase: input.phase,
        reason: decision.reason,
      },
      extra: {
        error: redactLogFields(input.error),
      },
    });

  return decision;
};
