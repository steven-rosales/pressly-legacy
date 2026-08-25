import { makeAggregateError } from '@pressly/errors/app-error';
import { unexpectedError } from '@pressly/errors/factories';
import type { RunnableDurableJob } from './queue-job.ts';

export const makeSequentialDurableJob = (
  jobs: readonly RunnableDurableJob[],
): RunnableDurableJob =>
  Object.freeze({
    runOnce: async (signal): Promise<number> => {
      let processed = 0;
      const failures: unknown[] = [];

      for (const job of jobs) {
        if (signal.aborted) throw signal.reason;
        try {
          processed += await job.runOnce(signal);
        } catch (failure: unknown) {
          if (signal.aborted) throw failure;
          failures.push(failure);
        }
      }

      if (failures.length === 1) throw failures[0];
      if (failures.length > 1)
        throw unexpectedError({
          code: 'durable_peer_jobs_failed',
          message: `${failures.length} independent durable jobs failed in one pass.`,
          details: { failureCount: failures.length },
          cause: makeAggregateError({
            errors: failures,
            message: 'Independent durable jobs failed.',
          }),
        });

      return processed;
    },
  });
