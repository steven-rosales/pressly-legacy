import { makeAggregateError } from '@pressly/errors/app-error';
import { unexpectedError } from '@pressly/errors/factories';

export type DurableJobShutdown = () => Promise<void>;

export const shutdownDurableJobResources = async (
  shutdowns: readonly DurableJobShutdown[],
): Promise<void> => {
  const failures: unknown[] = [];

  for (const shutdown of shutdowns) {
    try {
      await shutdown();
    } catch (failure: unknown) {
      failures.push(failure);
    }
  }

  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw unexpectedError({
      code: 'durable_jobs_shutdown_failed',
      message: `${failures.length} durable jobs resources failed to shut down.`,
      details: { failureCount: failures.length },
      cause: makeAggregateError({
        errors: failures,
        message: 'Durable jobs shutdown failures.',
      }),
    });
};
