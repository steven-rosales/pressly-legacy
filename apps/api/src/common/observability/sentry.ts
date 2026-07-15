import * as Sentry from '@sentry/node';
import { normalizeUnknownError, type AppError } from '@pressly/errors';
import { redactLogFields } from '@pressly/logging';
import type {
  CounterLabels,
  CounterName,
  CounterSink,
  ErrorReportContext,
  ErrorReporter,
  MeasurementLabels,
  MeasurementSink,
} from '@pressly/metrics';
import type { Logger, LogFields } from '@pressly/logging';

type SentryConfig = Readonly<{
  enabled: boolean;
  dsn: string | undefined;
  environment: string;
  release: string | undefined;
  traceSampleRate: number;
}>;

export const initializeSentry = (config: SentryConfig): void => {
  if (!config.enabled) return;

  Sentry.init({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    tracesSampleRate: config.traceSampleRate,
    enableMetrics: true,
    sendDefaultPii: false,
    integrations: [
      Sentry.httpIntegration({ maxIncomingRequestBodySize: 'none' }),
      Sentry.requestDataIntegration({
        include: {
          cookies: false,
          data: false,
          headers: false,
          ip: false,
          query_string: false,
          url: true,
        },
      }),
    ],
  });
};

const highVolumeCounters = new Set<CounterName>([
  'api.http_requests',
  'api.sse_connections',
  'api.sse_events',
]);

const metricAttributeKeys = new Set([
  'method',
  'route',
  'status',
  'operation',
  'reason',
  'source',
  'outcome',
  'mode',
  'type',
]);

const metricAttributes = (
  labels: CounterLabels | MeasurementLabels | undefined,
): Record<string, string> => {
  const attributes: Record<string, string> = { runtime: 'api' };
  for (const [key, value] of Object.entries(labels ?? {})) {
    if (!metricAttributeKeys.has(key)) continue;
    attributes[key] = /^[a-z0-9_./:-]{1,120}$/i.test(value) ? value : 'other';
  }
  return attributes;
};

type ApiSentryMetrics = Readonly<
  Pick<typeof Sentry.metrics, 'count' | 'gauge' | 'distribution'>
>;

export const makeApiSignalSinks = (input: {
  logger: Logger;
  sentryEnabled: boolean;
  metricsEnabled: boolean;
  sentryMetrics?: ApiSentryMetrics;
  nowMs?: () => number;
  exportFailureLogIntervalMs?: number;
}): Readonly<{ counters: CounterSink; measurements: MeasurementSink }> => {
  const exportEnabled = input.sentryEnabled && input.metricsEnabled;
  const sentryMetrics = input.sentryMetrics ?? Sentry.metrics;
  const nowMs = input.nowMs ?? Date.now;
  const exportFailureLogIntervalMs = input.exportFailureLogIntervalMs ?? 60_000;
  const lastExportFailureAt = new Map<string, number>();

  const exportMetric = (name: string, capture: () => void): void => {
    if (!exportEnabled) return;
    try {
      capture();
    } catch (error: unknown) {
      const now = nowMs();
      const lastAt = lastExportFailureAt.get(name);
      if (lastAt !== undefined && now - lastAt < exportFailureLogIntervalMs)
        return;
      lastExportFailureAt.set(name, now);
      input.logger.warn(
        'api metric export failed',
        redactLogFields({ metric: name, error }) as LogFields,
      );
    }
  };

  return {
    counters: {
      increment: (name, labels) => {
        if (!highVolumeCounters.has(name))
          input.logger.info('api counter incremented', {
            metric: name,
            labels,
            value: 1,
          });
        exportMetric(name, () =>
          sentryMetrics.count(name, 1, {
            attributes: metricAttributes(labels),
          }),
        );
      },
    },
    measurements: {
      observe: (name, value, labels) => {
        exportMetric(name, () => {
          if (name === 'api.sse_active_connections')
            sentryMetrics.gauge(name, value, {
              attributes: metricAttributes(labels),
            });
          else
            sentryMetrics.distribution(name, value, {
              unit: 'second',
              attributes: metricAttributes(labels),
            });
        });
      },
    },
  };
};

export const flushSentry = (timeoutMs = 2_000): Promise<boolean> =>
  Sentry.flush(timeoutMs);

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

  shutdown: async () => {
    await flushSentry();
  },
});
