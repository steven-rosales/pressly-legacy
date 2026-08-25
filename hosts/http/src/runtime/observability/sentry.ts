import * as Sentry from '@sentry/node';
import { isSentryDsn } from '@pressly/config';
import {
  normalizeUnknownError,
  type AppError,
} from '@pressly/errors/app-error';
import { unexpectedError } from '@pressly/errors/factories';
import {
  isMetricName,
  metricCatalog,
  observabilityOperationIdFor,
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
import { systemClock } from '@pressly/time';

type SentryConfig = Readonly<{
  enabled: boolean;
  dsn: string | undefined;
  environment: string;
  release: string | undefined;
  traceSampleRate: number;
}>;

type SentryInitializationDependencies = Readonly<{
  initialize?: typeof Sentry.init;
  hasInitializedDsn?: () => boolean;
}>;

let sentryInitialized = false;

const writeEmergencyLog = (
  service: 'pressly-api',
  record: Pick<StructuredLogRecord, 'level' | 'message' | 'attributes'>,
): void => {
  if (record.level !== 'error' && record.level !== 'fatal') return;

  console.error(
    JSON.stringify({
      ...record.attributes,
      service,
      runtime: 'api',
      level: record.level,
      message: record.message,
    }),
  );
};

export const reportApiTelemetryFailure = (
  message: 'api.telemetry.initialization_failed' | 'api.telemetry.flush_failed',
): void =>
  writeEmergencyLog('pressly-api', {
    level:
      message === 'api.telemetry.initialization_failed' ? 'fatal' : 'error',
    message,
    attributes: {
      phase:
        message === 'api.telemetry.initialization_failed'
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

export const initializeSentry = (
  config: SentryConfig,
  dependencies: SentryInitializationDependencies = {},
): boolean => {
  sentryInitialized = false;
  if (!config.enabled) return false;

  if (!isSentryDsn(config.dsn)) {
    reportApiTelemetryFailure('api.telemetry.initialization_failed');
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
      tracesSampleRate: config.traceSampleRate,
      enableLogs: true,
      enableMetrics: true,
      sendDefaultPii: false,
      initialScope: { tags: { runtime: 'api' } },
      beforeSendLog: sanitizedLog,
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

    if (!hasInitializedDsn()) {
      reportApiTelemetryFailure('api.telemetry.initialization_failed');
      return false;
    }

    sentryInitialized = true;
    return true;
  } catch {
    reportApiTelemetryFailure('api.telemetry.initialization_failed');
    return false;
  }
};

export const requireApiSentryInitialization = (
  enabled: boolean,
  initialized: boolean,
): void => {
  if (!enabled || initialized) return;

  throw unexpectedError({
    code: 'api_sentry_initialization_failed',
    message: 'The API could not initialize its required Sentry client.',
    safeMessage: 'API telemetry initialization failed.',
  });
};

export const makeApiRuntimeLogger = (config: SentryConfig): Logger => {
  const fields: LogFields = {
    service: 'pressly-api',
    environment: config.environment,
    runtime: 'api',
    ...(config.release === undefined ? {} : { release: config.release }),
  };

  if (!config.enabled)
    return makeJsonLogger({
      service: 'pressly-api',
      environment: config.environment,
      ...(config.release === undefined ? {} : { release: config.release }),
    }).child({ runtime: 'api' });

  return makeStructuredLogger({
    fields,
    write: (record) => {
      if (!sentryInitialized) {
        writeEmergencyLog('pressly-api', record);
        return;
      }
      Sentry.logger[record.level](record.message, record.attributes);
    },
    onWriteFailure: (_failure, record) =>
      writeEmergencyLog('pressly-api', record),
  });
};

const metricAttributes = (
  name: MetricName,
  labels: CounterLabels | MeasurementLabels | undefined,
): Record<string, string> => {
  const definition = metricCatalog[name];
  const allowed = new Set<MetricAttributeKey>(definition.allowedAttributes);
  const attributes: Record<string, string> = { runtime: 'api' };

  for (const [key, value] of Object.entries(labels ?? {})) {
    if (key === 'runtime') continue;
    if (!allowed.has(key as MetricAttributeKey)) continue;

    const finiteAttributeValues = definition.attributeValues as
      | Readonly<Partial<Record<MetricAttributeKey, readonly string[]>>>
      | undefined;
    const finiteValues = finiteAttributeValues?.[key as MetricAttributeKey];
    attributes[key] =
      finiteValues === undefined
        ? /^[a-z0-9_./:-]{1,120}$/i.test(value)
          ? value
          : 'other'
        : finiteValues.includes(value)
          ? value
          : 'other';
  }

  if (
    attributes['operation_id'] === undefined &&
    allowed.has('operation_id') &&
    attributes['operation'] !== undefined
  ) {
    const operationId = observabilityOperationIdFor(attributes['operation']);
    if (operationId !== undefined) attributes['operation_id'] = operationId;
  }

  return attributes;
};

type ApiSentryMetrics = Readonly<
  Pick<typeof Sentry.metrics, 'count' | 'gauge' | 'distribution'>
>;

const sentryMetricUnit = (unit: MetricUnit): 'second' | undefined =>
  // Sentry represents count semantics with its unitless default. The catalog's
  // `count` is a domain contract and must not be forwarded as an SDK unit.
  unit === 'second' ? 'second' : undefined;

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
  const nowMs = input.nowMs ?? (() => systemClock.now().getTime());
  const exportFailureLogIntervalMs = input.exportFailureLogIntervalMs ?? 60_000;
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
    if (!exportEnabled) return;
    try {
      capture();
    } catch (error: unknown) {
      const now = nowMs();
      const lastAt = lastExportFailureAt.get(name);
      if (lastAt !== undefined && now - lastAt < exportFailureLogIntervalMs)
        return;
      lastExportFailureAt.set(name, now);
      attemptObservation(() =>
        input.logger.warn(
          'api metric export failed',
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

export const makeApiTraceSink = (enabled: boolean): TraceSink => {
  if (!enabled || !sentryInitialized) return nullTraceSink;

  return {
    startActiveSpan: (definition, work) =>
      Sentry.startSpan(
        {
          name: definition.name,
          op: definition.operation,
          ...(definition.attributes === undefined
            ? {}
            : { attributes: definition.attributes }),
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
    attemptObservation(() => {
      const appError = normalizeUnknownError(error);

      Sentry.withScope((scope) => {
        setReportContext(scope, context);
        setAppErrorContext(scope, appError);
        scope.setLevel(appError.status >= 500 ? 'error' : 'warning');

        Sentry.captureException(appError);
      });
    });
  },

  shutdown: async () => {
    const flushed = await flushSentry();
    if (!flushed)
      throw unexpectedError({
        code: 'api_sentry_flush_timed_out',
        message: 'Sentry did not flush before the API shutdown deadline.',
        safeMessage: 'API telemetry did not flush before shutdown.',
      });
  },
});
