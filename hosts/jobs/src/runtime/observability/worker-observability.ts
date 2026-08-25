import * as Sentry from '@sentry/node';
import type { NodeOptions } from '@sentry/node';
import { isSentryDsn } from '@pressly/config';
import {
  isAppError,
  makeAggregateError,
  makeAppError,
} from '@pressly/errors/app-error';
import { unexpectedError } from '@pressly/errors/factories';
import {
  isMetricName,
  metricCatalog,
  observabilityOperationIdFor,
  observabilityOperationIdForJobLabel,
  type MetricAttributeKey,
  type MetricName,
  type MetricUnit,
} from '@pressly/generated/observability-catalog';
import {
  makeJsonLogger,
  makeStructuredLogger,
  redactLogFields,
  toStructuredLogAttributes,
  toStructuredLogMessage,
  type Logger,
  type LogFields,
  type StructuredLogRecord,
} from '@pressly/logging';
import { systemClock, type Clock } from '@pressly/time';
import {
  attemptObservation,
  nullTraceSink,
  type CounterLabels,
  type CounterSink,
  type ErrorReportContext,
  type ErrorReporter,
  type MeasurementLabels,
  type MeasurementSink,
  type TraceSink,
} from '@pressly/observability';
import type { WorkerHeartbeat } from '../heartbeat.ts';

type WorkerSentryConfig = Readonly<{
  enabled: boolean;
  dsn: string | undefined;
  environment: string;
  release: string | undefined;
  traceSampleRate: number;
}>;

type BeforeSendTransaction = NonNullable<NodeOptions['beforeSendTransaction']>;
type TracesSampler = NonNullable<NodeOptions['tracesSampler']>;

const workerTraceOperationAttribute = 'pressly.trace.operation';
const workerIdleTransactionIntervalNanoseconds = 60_000_000_000n;

/**
 * Worker job outcomes are only known when the root span finishes. Keep every
 * busy or failed transaction, but bound successful idle transactions per job
 * at the final SDK send boundary. Transactions from other runtime boundaries
 * are never interpreted here.
 */
export const makeWorkerTransactionFilter = (
  input: {
    nowNanoseconds?: () => bigint;
    idleIntervalNanoseconds?: bigint;
  } = {},
): BeforeSendTransaction => {
  const nowNanoseconds = input.nowNanoseconds ?? process.hrtime.bigint;
  const idleIntervalNanoseconds =
    input.idleIntervalNanoseconds ?? workerIdleTransactionIntervalNanoseconds;
  const lastIdleTransactionAt = new Map<string, bigint>();

  return (event) => {
    const trace = event.contexts?.trace;
    if (trace?.op !== 'worker.job') return event;

    const outcome = trace.data?.['outcome'];
    if (outcome !== 'idle') return event;

    const job = trace.data?.['job'];
    if (typeof job !== 'string' || job.length === 0) return event;

    let now: bigint;
    try {
      now = nowNanoseconds();
    } catch {
      return event;
    }

    const lastAt = lastIdleTransactionAt.get(job);
    if (lastAt !== undefined && now - lastAt < idleIntervalNanoseconds)
      return null;

    lastIdleTransactionAt.set(job, now);
    return event;
  };
};

/**
 * Unless tracing is explicitly disabled, Worker job roots must be recorded
 * until their eventual outcome is known. The corresponding send filter removes
 * excess idle transactions; other roots retain the configured tracing policy,
 * including inherited decisions.
 */
export const makeWorkerTracesSampler =
  (traceSampleRate: number): TracesSampler =>
  (context) =>
    context.attributes?.[workerTraceOperationAttribute] === 'worker.job'
      ? traceSampleRate === 0
        ? 0
        : 1
      : context.inheritOrSampleWith(traceSampleRate);

let workerSentryInitialized = false;

const writeEmergencyLog = (
  record: Pick<StructuredLogRecord, 'level' | 'message' | 'attributes'>,
): void => {
  if (record.level !== 'error' && record.level !== 'fatal') return;

  console.error(
    JSON.stringify({
      ...record.attributes,
      service: 'pressly-worker',
      runtime: 'worker',
      level: record.level,
      message: record.message,
    }),
  );
};

export const reportWorkerTelemetryFailure = (
  message:
    | 'worker.telemetry.initialization_failed'
    | 'worker.telemetry.flush_failed',
): void =>
  writeEmergencyLog({
    level:
      message === 'worker.telemetry.initialization_failed' ? 'fatal' : 'error',
    message,
    attributes: {
      phase:
        message === 'worker.telemetry.initialization_failed'
          ? 'startup'
          : 'shutdown',
    },
  });

const sanitizedLog = <
  Log extends Readonly<{
    message: string;
    attributes?: Record<string, unknown>;
  }>,
>(
  log: Log,
): Log =>
  ({
    ...log,
    message: toStructuredLogMessage(log.message),
    attributes: toStructuredLogAttributes(log.attributes ?? {}),
  }) as Log;

export const initializeWorkerSentry = (
  config: WorkerSentryConfig,
  dependencies: Readonly<{
    initialize?: typeof Sentry.init;
    hasInitializedDsn?: () => boolean;
  }> = {},
): boolean => {
  workerSentryInitialized = false;
  if (!config.enabled) return false;

  if (!isSentryDsn(config.dsn)) {
    reportWorkerTelemetryFailure('worker.telemetry.initialization_failed');
    return false;
  }

  const initialize = dependencies.initialize ?? Sentry.init;
  const hasInitializedDsn =
    dependencies.hasInitializedDsn ??
    (() => Sentry.getClient()?.getDsn() !== undefined);

  try {
    initialize({
      dsn: config.dsn,
      environment: config.environment,
      release: config.release,
      tracesSampler: makeWorkerTracesSampler(config.traceSampleRate),
      enableLogs: true,
      enableMetrics: true,
      sendDefaultPii: false,
      beforeSendLog: sanitizedLog,
      beforeSendTransaction: makeWorkerTransactionFilter(),
      initialScope: {
        tags: { runtime: 'worker' },
      },
    });

    if (!hasInitializedDsn()) {
      reportWorkerTelemetryFailure('worker.telemetry.initialization_failed');
      return false;
    }

    workerSentryInitialized = true;
    return true;
  } catch {
    reportWorkerTelemetryFailure('worker.telemetry.initialization_failed');
    return false;
  }
};

export const requireWorkerSentryInitialization = (
  enabled: boolean,
  initialized: boolean,
): void => {
  if (!enabled || initialized) return;

  throw unexpectedError({
    code: 'worker_sentry_initialization_failed',
    message: 'The Worker could not initialize its required Sentry client.',
    safeMessage: 'Worker telemetry initialization failed.',
  });
};

export const makeWorkerRuntimeLogger = (config: WorkerSentryConfig): Logger => {
  const fields: LogFields = {
    service: 'pressly-worker',
    environment: config.environment,
    runtime: 'worker',
    ...(config.release === undefined ? {} : { release: config.release }),
  };

  if (!config.enabled)
    return makeJsonLogger({
      service: 'pressly-worker',
      environment: config.environment,
      ...(config.release === undefined ? {} : { release: config.release }),
    }).child({ runtime: 'worker' });

  return makeStructuredLogger({
    fields,
    write: (record) => {
      if (!workerSentryInitialized) {
        writeEmergencyLog(record);
        return;
      }
      Sentry.logger[record.level](record.message, record.attributes);
    },
    onWriteFailure: (_failure, record) => writeEmergencyLog(record),
  });
};

export const sanitizeWorkerError = (
  error: unknown,
  seen: WeakSet<object> = new WeakSet(),
): Error => {
  if (typeof error === 'object' && error !== null) {
    if (seen.has(error))
      return unexpectedError({
        code: 'circular_error_cause',
        message: 'Circular error cause.',
      });

    seen.add(error);
  }

  const throwable =
    error instanceof Error
      ? error
      : unexpectedError({
          code: 'non_error_worker_failure',
          message: String(error),
        });

  const redacted = redactLogFields(throwable) as {
    name?: string;
    message?: string;
    stack?: string;
  };

  const cause =
    error instanceof Error && error.cause !== undefined
      ? sanitizeWorkerError(error.cause, seen)
      : undefined;

  const aggregateErrors =
    error instanceof AggregateError
      ? error.errors.map((member) => sanitizeWorkerError(member, seen))
      : undefined;

  const safe = isAppError(error)
    ? makeAppError({
        kind: error.kind,
        code: error.code,
        message: error.safeMessage,
        safeMessage: error.safeMessage,
        status: error.status,
        ...(cause === undefined ? {} : { cause }),
        ...(error.traceId === undefined ? {} : { traceId: error.traceId }),
      })
    : aggregateErrors !== undefined
      ? cause === undefined
        ? makeAggregateError({
            errors: aggregateErrors,
            message: redacted.message ?? 'Unknown worker failures.',
          })
        : makeAggregateError({
            errors: aggregateErrors,
            message: redacted.message ?? 'Unknown worker failures.',
            cause,
          })
      : cause === undefined
        ? unexpectedError({
            code: 'sanitized_worker_failure',
            message: redacted.message ?? 'Unknown worker failure.',
          })
        : unexpectedError({
            code: 'sanitized_worker_failure',
            message: redacted.message ?? 'Unknown worker failure.',
            cause,
          });

  safe.name = redacted.name ?? 'Error';

  if (redacted.stack !== undefined) safe.stack = redacted.stack;
  return safe;
};

export const makeWorkerSentryReporter = (enabled: boolean): ErrorReporter => ({
  capture: (error, context) => {
    if (!enabled) return;

    attemptObservation(() =>
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
        Sentry.captureException(sanitizeWorkerError(error));
      }),
    );
  },
  shutdown: async () => {
    if (!enabled) return;
    const flushed = await Sentry.flush(2_000);
    if (!flushed)
      throw unexpectedError({
        code: 'worker_sentry_flush_timed_out',
        message: 'Sentry did not flush before the Worker shutdown deadline.',
        safeMessage: 'Worker telemetry did not flush before shutdown.',
      });
  },
});

type WorkerSentryMetrics = Readonly<
  Pick<typeof Sentry.metrics, 'count' | 'gauge' | 'distribution'>
>;

const sentryMetricUnit = (unit: MetricUnit): 'second' | undefined =>
  // Sentry represents count semantics with its unitless default. The catalog's
  // `count` is a domain contract and must not be forwarded as an SDK unit.
  unit === 'second' ? 'second' : undefined;

const metricAttributeValue = /^[a-z0-9][a-z0-9_.-]{0,63}$/i;

const metricAttributes = (
  name: MetricName,
  labels: CounterLabels | MeasurementLabels | undefined,
): Record<string, string> => {
  const definition = metricCatalog[name];
  const allowed = new Set<MetricAttributeKey>(definition.allowedAttributes);
  const attributes: Record<string, string> = { runtime: 'worker' };
  const redacted = redactLogFields(labels ?? {}) as Record<string, unknown>;

  for (const [key, value] of Object.entries(redacted)) {
    if (key === 'runtime') continue;
    if (!allowed.has(key as MetricAttributeKey) || typeof value !== 'string')
      continue;

    const finiteAttributeValues = definition.attributeValues as
      | Readonly<Partial<Record<MetricAttributeKey, readonly string[]>>>
      | undefined;
    const finiteValues = finiteAttributeValues?.[key as MetricAttributeKey];
    attributes[key] =
      finiteValues === undefined
        ? metricAttributeValue.test(value)
          ? value
          : 'other'
        : finiteValues.includes(value)
          ? value
          : 'other';
  }

  if (attributes['operation_id'] === undefined && allowed.has('operation_id')) {
    const operation = attributes['operation'];
    const job = attributes['job'];
    const operationId =
      operation === undefined
        ? job === undefined
          ? undefined
          : observabilityOperationIdForJobLabel(job)
        : observabilityOperationIdFor(operation);
    if (operationId !== undefined) attributes['operation_id'] = operationId;
  }

  return attributes;
};

export const workerHeartbeatMonitorSlug = 'pressly-worker-progress';
export const workerHeartbeatCheckInIntervalMs = 60_000;

export const makeWorkerSentryHeartbeat = (input: {
  heartbeat: WorkerHeartbeat;
  logger: Logger;
  sentryEnabled: boolean;
  clock?: Clock;
  checkInIntervalMs?: number;
  captureCheckIn?: typeof Sentry.captureCheckIn;
}): WorkerHeartbeat => {
  const clock = input.clock ?? systemClock;
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
        attemptObservation(() =>
          input.logger.warn(
            'worker heartbeat check-in failed',
            redactLogFields({ error }) as LogFields,
          ),
        );
      }
    },
  };
};

export const makeWorkerSignalSinks = (input: {
  logger: Logger;
  clock?: Clock;
  measurementLogIntervalMs: number;
  sentryEnabled?: boolean;
  sentryMetrics?: WorkerSentryMetrics;
}): Readonly<{ counters: CounterSink; measurements: MeasurementSink }> => {
  const clock = input.clock ?? systemClock;
  const sentryMetrics = input.sentryMetrics ?? Sentry.metrics;
  const lastExportFailureAt = new Map<string, number>();

  const captureMetric = (
    name: string,
    value: number,
    labels: CounterLabels | MeasurementLabels | undefined,
  ): void => {
    if (!isMetricName(name)) return;
    const definition = metricCatalog[name];
    const unit = sentryMetricUnit(definition.unit);
    const options = {
      attributes: metricAttributes(name, labels),
      ...(unit === undefined ? {} : { unit }),
    };

    if (definition.instrument === 'counter')
      sentryMetrics.count(name, value, options);
    else if (definition.instrument === 'gauge')
      sentryMetrics.gauge(name, value, options);
    else sentryMetrics.distribution(name, value, options);
  };

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

      attemptObservation(() =>
        input.logger.warn(
          'worker metric export failed',
          redactLogFields({ metric: name, error }) as LogFields,
        ),
      );
    }
  };

  return {
    counters: {
      increment: (name: string, labels?: CounterLabels) => {
        exportMetric(name, () => captureMetric(name, 1, labels));
      },
    },
    measurements: {
      observe: (name: string, value: number, labels?: MeasurementLabels) => {
        exportMetric(name, () => captureMetric(name, value, labels));
      },
    },
  };
};

export const makeWorkerTraceSink = (enabled: boolean): TraceSink => {
  if (!enabled || !workerSentryInitialized) return nullTraceSink;

  return {
    startActiveSpan: (definition, work) =>
      Sentry.startSpan(
        {
          name: definition.name,
          op: definition.operation,
          attributes: {
            ...definition.attributes,
            [workerTraceOperationAttribute]: definition.operation,
          },
        },
        (span) =>
          work({
            setAttribute: (name, value) => span.setAttribute(name, value),
            setStatus: (status) =>
              span.setStatus({ code: status === 'ok' ? 1 : 2 }),
          }),
      ),
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
  attemptObservation(() => {
    if (input.level === 'fatal')
      input.logger.fatal('worker runtime failure', fields);
    else input.logger.error('worker runtime failure', fields);
  });

  attemptObservation(() =>
    input.counters.increment('worker.loop_failures', {
      operation: input.operation,
    }),
  );
  attemptObservation(() =>
    input.errors.capture(input.error, {
      source: 'worker',
      operation: input.operation,
      tags: input.tags,
      extra: {
        ...input.extra,
        error: redactLogFields(input.error),
      },
    } satisfies ErrorReportContext),
  );
};
