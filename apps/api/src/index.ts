/**
 * `index.ts` wires runtime: libraries, engines, and services
 */

import './instrument.ts';
import { createDatabaseRuntime } from '@pressly/db';
import { makeApiApp } from './app.ts';
import { apiEnv } from './common/config/env.ts';
import { makePinoLogger } from './common/logging/pino-logger.ts';
import { installShutdownHandlers } from './common/runtime/shutdown.ts';
import { startServer } from './server.ts';
import {
  makeLogCounterSink,
  makeSecurityEventSink,
} from './common/logging/security-events.ts';
import {
  captureSentryException,
  flushSentry,
} from './common/observability/sentry.ts';

const main = async (): Promise<void> => {
  const logger = makePinoLogger({
    level: apiEnv.logLevel,
    environment: apiEnv.nodeEnv,
  });

  const database = createDatabaseRuntime({
    databaseUrl: apiEnv.databaseUrl,
    maxConnections: apiEnv.databaseMaxConnections ?? 100,
    connectTimeoutSeconds: 5,
    idleTimeoutSeconds: 30,
    maxLifetimeSeconds: 60 * 30,
  });
  const securityEvents = makeSecurityEventSink({
    logger,
    counters: makeLogCounterSink(logger),
  });

  const app = makeApiApp({ env: apiEnv, logger, securityEvents, database });

  const server = await startServer({
    app,
    host: apiEnv.host,
    port: apiEnv.port,
    logger,
  });

  installShutdownHandlers({
    logger,
    shutdownGracePeriodMs: apiEnv.shutdownGracePeriodMs,

    forceClose: server.forceClose,

    close: async () => {
      await server.close();
      await database.close();
      await flushSentry();
    },
  });
};

main().catch(async (error: unknown) => {
  captureSentryException(error);
  await flushSentry();
  console.error(error);
  process.exitCode = 1;
});
