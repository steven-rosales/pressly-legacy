import * as Sentry from '@sentry/node';
import { redactLogFields, type Logger, type LogFields } from '@pressly/logging';
import type {
  CounterLabels,
  CounterName,
  CounterSink,
  ErrorReportContext,
  ErrorReporter,
  MeasurementLabels,
  MeasurementName,
  MeasurementSink,
} from '@pressly/metrics';
import type { WorkerHeartbeat } from './heartbeat.ts';

type WorkerSentryConfig = Readonly<{
  enabled: boolean;
  dsn: string | undefined;
  environment: string;
  release: string | undefined;
  traceSampleRate: number;
}>;

export const initializeWorkerSentry = (
  config: WorkerSentryConfig,
  initialize: typeof Sentry.init = Sentry.init,
): void => {
  if (!config.enabled) return;

  initialize({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release,
    tracesSampleRate: config.traceSampleRate,
    enableMetrics: true,
    sendDefaultPii: false,
    initialScope: {
      tags: { runtime: 'worker' },
    },
  });
};

const sanitizedError = (error: unknown): Error => {
  const redacted = redactLogFields(
    error instanceof Error ? error : new Error(String(error)),
  ) as { name?: string; message?: string; stack?: string };
  const safe = new Error(redacted.message ?? 'Unknown worker failure.');
  safe.name = redacted.name ?? 'Error';
  if (redacted.stack !== undefined) safe.stack = redacted.stack;
  return safe;
};

export const makeWorkerSentryReporter = (enabled: boolean): ErrorReporter => ({
  capture: (error, context) => {
    if (!enabled) return;

    Sentry.withScope((scope) => {
      scope.setTag('runtime', 'worker');
      scope.setTag('source', context.source);
      if (context.operation !== undefined)
        scope.setTag('operation', context.operation);
      for (const [key, value] of Object.entries(context.tags ?? {}))
        scope.setTag(key, value);
      if (context.extra !== undefined)
        scope.setContext(
          'worker',
          redactLogFields(context.extra) as Record<string, unknown>,
        );
      Sentry.captureException(sanitizedError(error));
    });
  },
  shutdown: async () => {
    if (enabled) await Sentry.flush(2_000);
  },
});

const metricKey = (
  name: string,
  labels: CounterLabels | MeasurementLabels | undefined,
): string =>
  `${name}:${JSON.stringify(
    Object.entries(labels ?? {}).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  )}`;

type WorkerSentryMetrics = Readonly<
  Pick<typeof Sentry.metrics, 'count' | 'gauge' | 'distribution'>
>;

const metricAttributeKeys = new Set([
  'job',
  'outcome',
  'code',
  'operation',
  'disposition',
]);
const metricAttributeValue = /^[a-z0-9][a-z0-9_.-]{0,63}$/i;

const metricAttributes = (
  labels: CounterLabels | MeasurementLabels | undefined,
): Record<string, string> => {
  const attributes: Record<string, string> = { runtime: 'worker' };
  const redacted = redactLogFields(labels ?? {}) as Record<string, unknown>;

  for (const [key, value] of Object.entries(redacted)) {
    if (!metricAttributeKeys.has(key) || typeof value !== 'string') continue;
    attributes[key] = metricAttributeValue.test(value) ? value : 'other';
  }

  return attributes;
};

const secondsMeasurements = new Set<MeasurementName>([
  'worker.inbox_oldest_pending_age_seconds',
  'worker.processing_latency_seconds',
  'worker.reconciliation_lag_seconds',
]);

export const workerHeartbeatMonitorSlug = 'pressly-worker-heartbeat';
export const workerHeartbeatCheckInIntervalMs = 60_000;

export const makeWorkerSentryHeartbeat = (input: {
  heartbeat: WorkerHeartbeat;
  logger: Logger;
  sentryEnabled: boolean;
  clock?: Readonly<{ now: () => Date }>;
  checkInIntervalMs?: number;
  captureCheckIn?: typeof Sentry.captureCheckIn;
}): WorkerHeartbeat => {
  const clock = input.clock ?? { now: () => new Date() };
  const checkInIntervalMs =
    input.checkInIntervalMs ?? workerHeartbeatCheckInIntervalMs;
  const captureCheckIn = input.captureCheckIn ?? Sentry.captureCheckIn;
  let lastCheckInAttemptAt: number | undefined;

  return {
    beat: async () => {
      await input.heartbeat.beat();
      if (!input.sentryEnabled) return;

      const now = clock.now().getTime();
      if (
        lastCheckInAttemptAt !== undefined &&
        now - lastCheckInAttemptAt < checkInIntervalMs
      )
        return;

      lastCheckInAttemptAt = now;
      try {
        captureCheckIn(
          { monitorSlug: workerHeartbeatMonitorSlug, status: 'ok' },
          {
            schedule: {
              type: 'interval',
              value: Math.max(1, Math.ceil(checkInIntervalMs / 60_000)),
              unit: 'minute',
            },
            checkinMargin: 1,
            maxRuntime: 1,
            failureIssueThreshold: 1,
            recoveryThreshold: 1,
            timezone: 'UTC',
          },
        );
      } catch (error: unknown) {
        input.logger.warn(
          'worker heartbeat check-in failed',
          redactLogFields({ error }) as LogFields,
        );
      }
    },
  };
};

export const makeWorkerSignalSinks = (input: {
  logger: Logger;
  clock?: Readonly<{ now: () => Date }>;
  measurementLogIntervalMs: number;
  sentryEnabled?: boolean;
  sentryMetrics?: WorkerSentryMetrics;
}): Readonly<{ counters: CounterSink; measurements: MeasurementSink }> => {
  const clock = input.clock ?? { now: () => new Date() };
  const sentryMetrics = input.sentryMetrics ?? Sentry.metrics;
  const lastMeasurementAt = new Map<string, number>();
  const lastExportFailureAt = new Map<string, number>();

  const exportMetric = (name: string, capture: () => void): void => {
    if (input.sentryEnabled !== true) return;
    try {
      capture();
    } catch (error: unknown) {
      const now = clock.now().getTime();
      const lastAt = lastExportFailureAt.get(name);
      if (lastAt !== undefined && now - lastAt < input.measurementLogIntervalMs)
        return;
      lastExportFailureAt.set(name, now);
      input.logger.warn(
        'worker metric export failed',
        redactLogFields({ metric: name, error }) as LogFields,
      );
    }
  };

  return {
    counters: {
      increment: (name: CounterName, labels?: CounterLabels) => {
        input.logger.info('worker counter incremented', {
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
      observe: (
        name: MeasurementName,
        value: number,
        labels?: MeasurementLabels,
      ) => {
        const now = clock.now().getTime();
        const key = metricKey(name, labels);
        const lastAt = lastMeasurementAt.get(key);
        if (
          lastAt !== undefined &&
          now - lastAt < input.measurementLogIntervalMs
        )
          return;

        lastMeasurementAt.set(key, now);
        input.logger.info('worker measurement observed', {
          metric: name,
          labels,
          value,
        });
        const options = {
          attributes: metricAttributes(labels),
          ...(secondsMeasurements.has(name) ? { unit: 'second' } : {}),
        };
        exportMetric(name, () => {
          if (name === 'worker.processing_latency_seconds')
            sentryMetrics.distribution(name, value, options);
          else sentryMetrics.gauge(name, value, options);
        });
      },
    },
  };
};

export const reportWorkerFailure = (input: {
  error: unknown;
  operation: string;
  logger: Logger;
  errors: ErrorReporter;
  counters: CounterSink;
  level?: 'error' | 'fatal';
  tags?: Readonly<Record<string, string>>;
  extra?: Readonly<Record<string, unknown>>;
}): void => {
  const fields = redactLogFields({
    operation: input.operation,
    error: input.error,
    ...input.extra,
  }) as LogFields;
  if (input.level === 'fatal')
    input.logger.fatal('worker runtime failure', fields);
  else input.logger.error('worker runtime failure', fields);

  input.counters.increment('worker.loop_failures', {
    operation: input.operation,
  });
  input.errors.capture(input.error, {
    source: 'worker',
    operation: input.operation,
    tags: input.tags,
    extra: {
      ...input.extra,
      error: redactLogFields(input.error),
    },
  } satisfies ErrorReportContext);
};
