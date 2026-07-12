/**
 * `index.ts` wires runtime: libraries, engines, and services
 */

import './instrument.ts';
import { createDatabaseRuntime } from '@pressly/db';
import { makeJsonLogger } from '@pressly/logging';
import { nullErrorReporter } from '@pressly/metrics';
import { makeApiApp } from './app.ts';
import { apiEnv } from './common/config/env.ts';
import { installShutdownHandlers } from './common/runtime/shutdown.ts';
import { startServer } from './server.ts';
import { makeSecurityEventSink } from './common/logging/security-events.ts';
import {
  flushSentry,
  makeSentryErrorReporter,
} from './common/observability/sentry.ts';
import { observeApiRuntimeFailure } from './common/observability/api-observability.ts';
import { makeLoggingCounterSink } from './common/observability/production-signals.ts';

const makeRuntimeLogger = () =>
  makeJsonLogger({
    service: 'pressly-api',
    environment: apiEnv.nodeEnv,
    ...(apiEnv.observability.sentry.release === undefined
      ? {}
      : { release: apiEnv.observability.sentry.release }),
  }).child({ runtime: 'api' });

const main = async (): Promise<void> => {
  const logger = makeRuntimeLogger();
  const errors = apiEnv.observability.sentry.enabled
    ? makeSentryErrorReporter()
    : nullErrorReporter;
  const counters = makeLoggingCounterSink(logger);

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
    },
    database,
  };

  const app = makeApiApp(runtime);

  const server = await startServer({
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

  installShutdownHandlers({
    logger,
    shutdownGracePeriodMs: apiEnv.shutdownGracePeriodMs,

    forceClose: server.forceClose,

    close: async () => {
      await server.close();
      await database.close();
      await errors.shutdown();
    },
  });
};

main().catch(async (error: unknown) => {
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
});
