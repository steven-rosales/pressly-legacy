import { resolve } from 'node:path';
import { config as loadEnvironmentFile } from 'dotenv';
import {
  nullErrorReporter,
  type RuntimeObservabilityCatalog,
} from '@pressly/observability';
import {
  initializeSentry,
  makeApiRuntimeLogger,
  makeApiSignalSinks,
  makeApiTraceSink,
  makeSentryErrorReporter,
  reportApiTelemetryFailure,
  requireApiSentryInitialization,
} from './observability/sentry.ts';

export type HttpProcessConfiguration = Readonly<{
  nodeEnv: string;
  features: Readonly<{ metricsEnabled: boolean }>;
  observability: Readonly<{
    sentry: Readonly<{
      enabled: boolean;
      dsn: string | undefined;
      release: string | undefined;
      traceSampleRate: number;
    }>;
  }>;
}>;

export type HttpProcessRuntime = Readonly<{
  logger: ReturnType<typeof makeApiRuntimeLogger>;
  errors: ReturnType<typeof makeSentryErrorReporter>;
  signals: ReturnType<typeof makeApiSignalSinks>;
  trace: ReturnType<typeof makeApiTraceSink>;
  nowNanoseconds: () => bigint;
  reportTelemetryFlushFailure: () => void;
  setExitCode: (code: number) => void;
}>;

export const readHttpProcessEnvironment = (): NodeJS.ProcessEnv => {
  loadEnvironmentFile({ path: resolve(process.cwd(), '.env.local') });
  return Object.freeze({ ...process.env });
};

export const makeHttpProcessRuntime = (
  configuration: HttpProcessConfiguration,
  catalog: RuntimeObservabilityCatalog,
): HttpProcessRuntime => {
  const sentryConfiguration = {
    enabled: configuration.observability.sentry.enabled,
    dsn: configuration.observability.sentry.dsn,
    release: configuration.observability.sentry.release,
    traceSampleRate: configuration.observability.sentry.traceSampleRate,
    environment: configuration.nodeEnv,
  };
  const initialized = initializeSentry(sentryConfiguration);
  requireApiSentryInitialization(
    configuration.observability.sentry.enabled,
    initialized,
  );

  const logger = makeApiRuntimeLogger(sentryConfiguration);
  const errors = configuration.observability.sentry.enabled
    ? makeSentryErrorReporter()
    : nullErrorReporter;
  const signals = makeApiSignalSinks({
    logger,
    catalog,
    sentryEnabled: configuration.observability.sentry.enabled,
    metricsEnabled: configuration.features.metricsEnabled,
  });

  return Object.freeze({
    logger,
    errors,
    signals,
    trace: makeApiTraceSink(configuration.observability.sentry.enabled),
    nowNanoseconds: process.hrtime.bigint,
    reportTelemetryFlushFailure: () =>
      reportApiTelemetryFailure('api.telemetry.flush_failed'),
    setExitCode: (code) => {
      process.exitCode = code;
    },
  });
};
