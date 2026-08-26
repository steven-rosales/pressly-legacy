import * as Sentry from '@sentry/react';
import type {
  ProcessorConnectionStateObserver,
  ProcessorRequestFailureObserver,
} from '@pressly/topology/browser';

export type ProcessorObservabilityConfig = Readonly<{
  dsn?: string;
  environment: string;
  release?: string;
  tracesSampleRate?: string;
}>;

const safeSampleRate = (raw: string | undefined): number => {
  if (raw === undefined) return 0.1;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0.1;
};

const withoutQueryOrFragment = (value: string): string => {
  try {
    const url = new URL(value, window.location.origin);

    return `${url.origin}${url.pathname}`;
  } catch {
    return value.split(/[?#]/, 1)[0] ?? value;
  }
};

const scrubBreadcrumb = (
  breadcrumb: Sentry.Breadcrumb,
): Sentry.Breadcrumb | null => {
  if (breadcrumb.category === 'console') return null;

  if (breadcrumb.data === undefined) return breadcrumb;

  if (breadcrumb.category === 'navigation') {
    const from = breadcrumb.data['from'];
    const to = breadcrumb.data['to'];
    return {
      ...breadcrumb,
      data: {
        ...(typeof from === 'string'
          ? { from: withoutQueryOrFragment(from) }
          : {}),
        ...(typeof to === 'string' ? { to: withoutQueryOrFragment(to) } : {}),
      },
    };
  }

  if (breadcrumb.category === 'fetch' || breadcrumb.category === 'xhr') {
    const url = breadcrumb.data['url'];
    const method = breadcrumb.data['method'];
    const statusCode = breadcrumb.data['status_code'];
    return {
      ...breadcrumb,
      data: {
        ...(typeof method === 'string' ? { method } : {}),
        ...(typeof statusCode === 'number' ? { status_code: statusCode } : {}),
        ...(typeof url === 'string'
          ? { url: withoutQueryOrFragment(url) }
          : {}),
      },
    };
  }

  return breadcrumb;
};

export const initializeProcessorObservability = (
  config: ProcessorObservabilityConfig,
): boolean => {
  if (config.dsn === undefined || config.dsn.length === 0) return false;

  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    ...(config.release === undefined || config.release.length === 0
      ? {}
      : { release: config.release }),
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: safeSampleRate(config.tracesSampleRate),
    enableLogs: false,
    sendDefaultPii: false,
    initialScope: { tags: { application: 'pressly-processor' } },
    beforeBreadcrumb: scrubBreadcrumb,
    beforeSend: (event) => {
      const scrubbed = { ...event };
      delete scrubbed.user;
      return {
        ...scrubbed,
        ...(event.request === undefined
          ? {}
          : {
              request: {
                ...(event.request.method === undefined
                  ? {}
                  : { method: event.request.method }),
                ...(event.request.url === undefined
                  ? {}
                  : { url: withoutQueryOrFragment(event.request.url) }),
              },
            }),
      };
    },
  });
  return true;
};

const uuidPattern =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

const normalizedRoute = (path: string): string => {
  try {
    return new URL(path, window.location.origin).pathname.replaceAll(
      uuidPattern,
      ':id',
    );
  } catch {
    return withoutQueryOrFragment(path).replaceAll(uuidPattern, ':id');
  }
};

export const observeProcessorRequestFailure: ProcessorRequestFailureObserver = (
  failure,
  context,
) => {
  const route = normalizedRoute(context.path);

  Sentry.addBreadcrumb({
    category: 'processor.request',
    level: 'warning',
    message: `${context.method.toUpperCase()} ${route} failed`,
    data: {
      code: failure.code,
      kind: failure.requestKind,
      ...(failure.responseStatus === undefined
        ? {}
        : { status: failure.responseStatus }),
      ...(failure.referenceId === undefined
        ? {}
        : { reference_id: failure.referenceId }),
    },
  });

  const actionable =
    failure.requestKind === 'invalid_response' ||
    failure.requestKind === 'unexpected' ||
    (failure.requestKind === 'unavailable' &&
      failure.responseStatus !== undefined);
  if (!actionable) return;

  Sentry.withScope((scope) => {
    scope.setLevel(failure.requestKind === 'unavailable' ? 'warning' : 'error');
    scope.setTag('failure.requestKind', failure.requestKind);
    scope.setTag('failure.code', failure.code);
    scope.setTag('http.route', route);
    scope.setTag('http.request.method', context.method.toUpperCase());
    if (failure.responseStatus !== undefined)
      scope.setTag('http.response.status_code', String(failure.responseStatus));
    scope.setContext('request_reference', {
      request_id: failure.requestId ?? null,
      trace_id: failure.traceId ?? null,
    });
    Sentry.captureException(failure);
  });
};

export const observeProductionConnectionState: ProcessorConnectionStateObserver =
  (state) => {
    Sentry.addBreadcrumb({
      category: 'processor.live_updates',
      level: state === 'reconnecting' ? 'warning' : 'info',
      message: `Production updates ${state}`,
      data: { state },
    });
  };
