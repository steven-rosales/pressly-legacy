import { createDatabaseRuntime } from '@pressly/db/client';
import {
  attemptAsyncObservation,
  nullErrorReporter,
} from '@pressly/observability';
import { makeApiApp } from './api.composition.ts';
import {
  cleanupApiAfterFailure,
  cleanupApiOrThrow,
  type ApiCleanupEffect,
  type ApiCleanupPlan,
} from './api-cleanup.ts';
import { apiEnv } from '../runtime/env.ts';
import { installShutdownHandlers } from './api-lifecycle.ts';
import { startServer } from '../http/server.ts';
import { makeSecurityEventSink } from '../runtime/security/security-events.ts';
import {
  makeApiSignalSinks,
  makeApiTraceSink,
  makeApiRuntimeLogger,
  makeSentryErrorReporter,
  reportApiTelemetryFailure,
} from '../runtime/observability/sentry.ts';
import { observeApiRuntimeFailure } from '../runtime/observability/runtime-failure.ts';
import { makePostgresProductionChangeFeed } from '../http/production/live/postgres-production-change-feed.adapter.ts';

const makeRuntimeLogger = () =>
  makeApiRuntimeLogger({
    ...apiEnv.observability.sentry,
    environment: apiEnv.nodeEnv,
  });

const makeRuntimeSignals = (logger: ReturnType<typeof makeRuntimeLogger>) =>
  makeApiSignalSinks({
    logger,
    sentryEnabled: apiEnv.observability.sentry.enabled,
    metricsEnabled: apiEnv.features.metricsEnabled,
  });

type ClosableApiResource = Readonly<{ close: () => Promise<void> }>;

const makeApiCleanupPlan = (input: {
  server?: ClosableApiResource;
  productionChanges: ClosableApiResource;
  database: ClosableApiResource;
}): ApiCleanupPlan => {
  const server = input.server;
  const serverEffects: readonly ApiCleanupEffect[] =
    server === undefined
      ? []
      : [{ resource: 'http_server', run: () => server.close() }];

  return [
    [
      ...serverEffects,
      {
        resource: 'production_change_feed',
        run: () => input.productionChanges.close(),
      },
    ],
    [{ resource: 'database', run: () => input.database.close() }],
  ];
};

const startApi = async (): Promise<void> => {
  const logger = makeRuntimeLogger();
  const errors = apiEnv.observability.sentry.enabled
    ? makeSentryErrorReporter()
    : nullErrorReporter;
  const signals = makeRuntimeSignals(logger);
  const counters = signals.counters;
  const trace = makeApiTraceSink(apiEnv.observability.sentry.enabled);

  const database = createDatabaseRuntime({
    databaseUrl: apiEnv.databaseUrl,
    maxConnections: apiEnv.databaseMaxConnections ?? 100,
    connectTimeoutSeconds: 5,
    idleTimeoutSeconds: 30,
    maxLifetimeSeconds: 60 * 30,
  });

  const securityEvents = makeSecurityEventSink({
    alerts: errors,
    counters,
  });

  const runtime = {
    env: apiEnv,
    logger,
    securityEvents,
    observability: {
      errors,
      counters,
      measurements: signals.measurements,
      trace,
    },
    database,
  };

  const productionChanges = makePostgresProductionChangeFeed({
    database,
    logger,
    counters,
  });
  try {
    await productionChanges.start();
  } catch (error: unknown) {
    return cleanupApiAfterFailure({
      primaryError: error,
      plan: makeApiCleanupPlan({ productionChanges, database }),
      logger,
    });
  }

  let server: Awaited<ReturnType<typeof startServer>>;
  try {
    const app = makeApiApp(runtime, { productionChanges });
    server = await startServer({
      app,
      host: apiEnv.host,
      port: apiEnv.port,
      logger,
      onServerError: (error) => {
        observeApiRuntimeFailure(runtime, {
          error,
          phase: 'server',
          operation: 'http_server',
        });
      },
    });
  } catch (error: unknown) {
    return cleanupApiAfterFailure({
      primaryError: error,
      plan: makeApiCleanupPlan({ productionChanges, database }),
      logger,
    });
  }

  installShutdownHandlers({
    logger,
    shutdownGracePeriodMs: apiEnv.shutdownGracePeriodMs,
    flush: () => errors.shutdown(),
    reportFlushFailure: () =>
      reportApiTelemetryFailure('api.telemetry.flush_failed'),

    forceClose: server.forceClose,

    close: async () =>
      cleanupApiOrThrow(
        makeApiCleanupPlan({
          server,
          productionChanges,
          database,
        }),
      ),
  });
};

export const runApi = async (): Promise<void> => {
  try {
    await startApi();
  } catch (error: unknown) {
    process.exitCode = 1;

    const logger = makeRuntimeLogger();
    const errors = apiEnv.observability.sentry.enabled
      ? makeSentryErrorReporter()
      : nullErrorReporter;

    observeApiRuntimeFailure(
      {
        logger,
        observability: {
          errors,
          counters: makeRuntimeSignals(logger).counters,
        },
      },
      {
        error,
        phase: 'startup',
        operation: 'api_startup',
      },
    );

    const flush = await attemptAsyncObservation(() => errors.shutdown());
    if (flush.tag === 'failed')
      reportApiTelemetryFailure('api.telemetry.flush_failed');
  }
};
