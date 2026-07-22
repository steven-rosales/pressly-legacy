import { createDatabaseRuntime } from '@pressly/db';
import { makeJsonLogger } from '@pressly/logging';
import { nullErrorReporter } from '@pressly/metrics';
import { makeApiApp } from './api.composition.ts';
import { apiEnv } from '../runtime/env.ts';
import { installShutdownHandlers } from './api-lifecycle.ts';
import { startServer } from '../http/server.ts';
import { makeSecurityEventSink } from '../runtime/security/security-events.ts';
import {
  flushSentry,
  makeApiSignalSinks,
  makeSentryErrorReporter,
} from '../runtime/observability/sentry.ts';
import { observeApiRuntimeFailure } from '../runtime/observability/runtime-failure.ts';
import { makeLoggingCounterSink } from '../runtime/observability/logging-counter.adapter.ts';
import { makePostgresProductionChangeFeed } from '../http/production/live/postgres-production-change-feed.adapter.ts';

const makeRuntimeLogger = () =>
  makeJsonLogger({
    service: 'pressly-api',
    environment: apiEnv.nodeEnv,
    ...(apiEnv.observability.sentry.release === undefined
      ? {}
      : { release: apiEnv.observability.sentry.release }),
  }).child({ runtime: 'api' });

const startApi = async (): Promise<void> => {
  const logger = makeRuntimeLogger();
  const errors = apiEnv.observability.sentry.enabled
    ? makeSentryErrorReporter()
    : nullErrorReporter;
  const signals = makeApiSignalSinks({
    logger,
    sentryEnabled: apiEnv.observability.sentry.enabled,
    metricsEnabled: apiEnv.features.metricsEnabled,
  });
  const counters = signals.counters;

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
    await productionChanges.close();
    await database.close();
    await errors.shutdown();
    throw error;
  }

  const app = makeApiApp(runtime, { productionChanges });

  let server: Awaited<ReturnType<typeof startServer>>;
  try {
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
    await productionChanges.close();
    await database.close();
    await errors.shutdown();
    throw error;
  }

  installShutdownHandlers({
    logger,
    shutdownGracePeriodMs: apiEnv.shutdownGracePeriodMs,

    forceClose: server.forceClose,

    close: async () => {
      const serverClosed = server.close();
      await productionChanges.close();
      await serverClosed;
      await database.close();
      await errors.shutdown();
    },
  });
};

export const runApi = async (): Promise<void> => {
  try {
    await startApi();
  } catch (error: unknown) {
    const logger = makeRuntimeLogger();
    const errors = apiEnv.observability.sentry.enabled
      ? makeSentryErrorReporter()
      : nullErrorReporter;

    observeApiRuntimeFailure(
      {
        logger,
        observability: {
          errors,
          counters: makeLoggingCounterSink(logger),
        },
      },
      {
        error,
        phase: 'startup',
        operation: 'api_startup',
      },
    );

    await flushSentry();
    process.exitCode = 1;
  }
};
