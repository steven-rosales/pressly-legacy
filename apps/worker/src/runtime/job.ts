import { makeAggregateError } from '@pressly/errors/app-error';
import { unexpectedError } from '@pressly/errors/factories';

export type WorkerJob = Readonly<{ runOnce: () => Promise<number> }>;

export const makeSequentialJob = (jobs: readonly WorkerJob[]): WorkerJob => ({
  runOnce: async () => {
    let processed = 0;
    const failures: unknown[] = [];

    for (const job of jobs) {
      try {
        processed += await job.runOnce();
      } catch (error: unknown) {
        failures.push(error);
      }
    }

    if (failures.length === 1) throw failures[0];
    if (failures.length > 1)
      throw unexpectedError({
        code: 'worker_peer_jobs_failed',
        message: `${failures.length} independent worker jobs failed in one pass.`,
        details: { failureCount: failures.length },
        cause: makeAggregateError({
          errors: failures,
          message: 'Independent worker jobs failed.',
        }),
      });

    return processed;
  },
});
