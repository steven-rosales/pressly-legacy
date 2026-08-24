import type { Logger } from '@pressly/logging';
import {
  attemptObservation,
  type CounterSink,
  type ErrorReporter,
  type MeasurementSink,
} from '@pressly/observability';
import type { DurableJobObservation, DurableJobObserver } from '@pressly/jobs';
import { reportWorkerFailure } from './worker-observability.ts';

const isPowerOfTwo = (value: number): boolean => (value & (value - 1)) === 0;

export const makeWorkerDurableJobObserver = (input: {
  logger: Logger;
  counters: CounterSink;
  measurements: MeasurementSink;
  errors: ErrorReporter;
}): DurableJobObserver =>
  Object.freeze({
    record: (observation: DurableJobObservation): void => {
      if (observation.kind === 'delivery-transition') return;

      if (observation.kind === 'queue-pass') {
        const outcome =
          observation.outcome === 'cancelled' ? 'failed' : observation.outcome;
        attemptObservation(() =>
          input.counters.increment('worker.job_passes', {
            job: observation.queueId,
            outcome,
          }),
        );
        if (observation.durationSeconds !== undefined)
          attemptObservation(() =>
            input.measurements.observe(
              'worker.job_pass_duration_seconds',
              observation.durationSeconds ?? 0,
              { job: observation.queueId, outcome },
            ),
          );
        return;
      }

      if (observation.consecutiveFailures === 1) {
        reportWorkerFailure({
          error: observation.failure,
          operation: 'worker_loop',
          logger: input.logger,
          errors: input.errors,
          counters: input.counters,
          extra: {
            consecutiveFailures: observation.consecutiveFailures,
            retryDelayMs: observation.retryDelayMs,
          },
        });
        return;
      }

      attemptObservation(() =>
        input.counters.increment('worker.loop_failures', {
          operation: 'worker_loop',
        }),
      );
      if (isPowerOfTwo(observation.consecutiveFailures))
        attemptObservation(() =>
          input.logger.warn('worker loop remains unavailable', {
            consecutiveFailures: observation.consecutiveFailures,
            retryDelayMs: observation.retryDelayMs,
          }),
        );
    },
  });
