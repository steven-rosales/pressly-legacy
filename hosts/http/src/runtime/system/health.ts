import { checkDatabaseHealth } from '@pressly/postgres/health';
import { apiFailure, apiSuccess } from '@pressly/http';
import { databaseError } from '@pressly/errors/factories';
import { redactLogFields, type LogFields } from '@pressly/logging';
import { attemptObservation } from '@pressly/observability';
import { Router } from 'express';
import type { Logger } from '@pressly/logging';

type HttpHealthRuntime = Readonly<{
  database: Readonly<{
    db: Parameters<typeof checkDatabaseHealth>[0];
  }>;
  logger: Logger;
}>;

export const makeHealthRoutes = (runtime: HttpHealthRuntime): Router => {
  const router = Router();

  router.get('/live', (_req, res) => {
    res.status(200).json(apiSuccess({ status: 'alive' }));
  });

  router.get('/ready', async (_req, res) => {
    const dbReady = await checkDatabaseHealth(runtime.database.db).catch(
      (error: unknown) => {
        attemptObservation(() =>
          runtime.logger.error(
            'database readiness check failed',
            redactLogFields({
              error:
                error instanceof Error
                  ? { name: error.name, message: error.message }
                  : String(error),
            }) as LogFields,
          ),
        );
        return false;
      },
    );

    if (!dbReady) {
      res.status(503).json(
        apiFailure(
          databaseError({
            code: 'database_not_ready',
            message: 'Database readiness check failed.',
            safeMessage: 'Service is not ready.',
            status: 503,
          }),
        ),
      );
      return;
    }

    res.status(200).json(apiSuccess({ status: 'ready' }));
  });

  return router;
};
