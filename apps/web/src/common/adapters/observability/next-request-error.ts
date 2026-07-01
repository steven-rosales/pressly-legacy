import { normalizeUnknownError } from '@pressly/errors';
import {
  decideObservation,
  type ErrorReporter,
  type ObservationDecision,
} from '@pressly/metrics';
import { makeSentryErrorReporter } from './sentry-reporter';

type UnknownRecord = Readonly<Record<string, unknown>>;

export type NextRequestErrorInput = Readonly<{
  error: unknown;
  request?: unknown;
  context?: unknown;
  reporter?: ErrorReporter;
}>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null;

const stringProperty = (
  value: unknown,
  property: string,
): string | undefined => {
  if (!isRecord(value)) return undefined;

  const field = value[property];
  return typeof field === 'string' && field.length > 0 ? field : undefined;
};

const pathFromUrl = (value: string | undefined): string | undefined => {
  if (value === undefined) return undefined;

  try {
    return new URL(value).pathname;
  } catch {
    return value;
  }
};

const requestRoute = (request: unknown, context: unknown): string | undefined =>
  stringProperty(context, 'routePath') ??
  stringProperty(context, 'path') ??
  stringProperty(request, 'path') ??
  pathFromUrl(stringProperty(request, 'url'));

export const observeNextRequestError = ({
  error,
  request,
  context,
  reporter = makeSentryErrorReporter(),
}: NextRequestErrorInput): ObservationDecision => {
  const appError = normalizeUnknownError(error);
  const route = requestRoute(request, context) ?? 'unknown';
  const routeType = stringProperty(context, 'routeType');
  const routerKind = stringProperty(context, 'routerKind');
  const decision = decideObservation({
    kind: 'error',
    source: 'web',
    rail: 'server',
    operation: 'next_request_error',
    route,
    criticality: 'high',
    error: {
      kind: appError.kind,
      code: appError.code,
      status: appError.status,
      traceId: appError.traceId,
    },
  });

  if (decision.report)
    reporter.capture(appError, {
      source: 'web',
      operation: 'next_request_error',
      route,
      traceId: appError.traceId,
      tags: {
        reason: decision.reason,
        error_kind: appError.kind,
        error_code: appError.code,
        status: String(appError.status),
        ...(routeType === undefined ? {} : { route_type: routeType }),
        ...(routerKind === undefined ? {} : { router_kind: routerKind }),
      },
    });

  return decision;
};
