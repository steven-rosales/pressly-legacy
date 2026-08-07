import { uuidIdSource } from '@pressly/kernel/node';
import { redactLogFields, type Logger, type LogFields } from '@pressly/logging';
import {
  attemptObservation,
  type CounterSink,
  type ErrorReporter,
  type MeasurementSink,
  type TraceSink,
} from '@pressly/observability';
import { makeFileHeartbeat } from '../runtime/heartbeat.js';
import type { WorkerConfig } from '../runtime/env.js';
import {
  makeWorkerSentryHeartbeat,
  reportWorkerFailure,
} from '../runtime/observability/worker-observability.js';
import { runWorkerLoop } from '../runtime/poll-loop.js';
import { composeWorkerJobs } from './worker-jobs.composition.js';
import { startWorkerLifecycle } from './worker-lifecycle.js';

export const runWorker = async (input: {
  config: WorkerConfig;
  logger: Logger;
  counters: CounterSink;
  measurements: MeasurementSink;
  errors: ErrorReporter;
  trace: TraceSink;
}): Promise<void> => {
  if (!input.config.features.jobsEnabled) {
    attemptObservation(() =>
      input.logger.warn('worker jobs disabled', {
        environment: input.config.nodeEnv,
      }),
    );
    return;
  }

  const workerId = uuidIdSource.next();
  attemptObservation(() =>
    input.logger.info('worker starting', {
      workerId,
      pollIntervalMs: input.config.jobs.pollIntervalMs,
      batchSize: input.config.jobs.batchSize,
    }),
  );

  const jobs = composeWorkerJobs({
    databaseUrl: input.config.databaseUrl,
    workerId,
    config: input.config.jobs,
    logger: input.logger,
    counters: input.counters,
    measurements: input.measurements,
    errors: input.errors,
    trace: input.trace,
  });
  const lifecycle = startWorkerLifecycle(input.logger);

  let failed = false;
  let primaryError: unknown;
  try {
    await runWorkerLoop({
      job: jobs.job,
      pollIntervalMs: input.config.jobs.pollIntervalMs,
      retryBaseMs: input.config.jobs.loopRetryBaseMs,
      retryMaxMs: input.config.jobs.loopRetryMaxMs,
      signal: lifecycle.signal,
      heartbeat: makeWorkerSentryHeartbeat({
        heartbeat: makeFileHeartbeat({
          path: input.config.jobs.heartbeatFile,
        }),
        logger: input.logger,
        sentryEnabled: input.config.observability.sentry.enabled,
      }),
      onError: ({ error, consecutiveFailures, retryDelayMs }) => {
        if (consecutiveFailures === 1)
          reportWorkerFailure({
            error,
            operation: 'worker_loop',
            logger: input.logger,
            errors: input.errors,
            counters: input.counters,
            extra: { consecutiveFailures, retryDelayMs },
          });
        else {
          attemptObservation(() =>
            input.counters.increment('worker.loop_failures', {
              operation: 'worker_loop',
            }),
          );
          if ((consecutiveFailures & (consecutiveFailures - 1)) === 0)
            attemptObservation(() =>
              input.logger.warn('worker loop remains unavailable', {
                consecutiveFailures,
                retryDelayMs,
              }),
            );
        }
      },
    });
  } catch (error: unknown) {
    failed = true;
    primaryError = error;
  }

  lifecycle.dispose();
  try {
    await jobs.close();
  } catch (error: unknown) {
    if (!failed) throw error;
    attemptObservation(() =>
      input.logger.error(
        'worker cleanup failed after runtime failure',
        redactLogFields({ error }) as LogFields,
      ),
    );
  }

  if (failed) throw primaryError;

  attemptObservation(() =>
    input.logger.info('worker stopped', { reason: 'shutdown_requested' }),
  );
};
