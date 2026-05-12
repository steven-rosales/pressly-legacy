import { createDatabaseRuntime } from '@pressly/db';
import { makeApiApp } from './app.ts';
import { apiEnv } from './common/config/env.ts';
import { makePinoLogger } from './common/logging/pino-logger.ts';
import { startServer } from './server.ts';

const main = async (): Promise<void> => {
  const logger = makePinoLogger({
    level: apiEnv.logLevel,
    environment: apiEnv.nodeEnv,
  });

  const database = createDatabaseRuntime(apiEnv.databaseUrl);

  const app = makeApiApp({ env: apiEnv, logger, database });

  const server = await startServer({
    app,
    host: apiEnv.host,
    port: apiEnv.port,
    logger,
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info('api shutdown started', { signal });

    server.close(async () => {
      await database.close();
      logger.info('api shutdown completed', { signal });
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
};

main().catch((error: unknown) => {
  console.log(error);
  process.exitCode = 1;
});
