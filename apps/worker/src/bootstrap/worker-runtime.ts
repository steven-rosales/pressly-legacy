import { randomUUID } from 'node:crypto';
import type { Logger } from '@pressly/logging';
import type {
  CounterSink,
  ErrorReporter,
  MeasurementSink,
} from '@pressly/metrics';
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
}): Promise<void> => {
  if (!input.config.features.jobsEnabled) {
    input.logger.warn('worker jobs disabled', {
      environment: input.config.nodeEnv,
    });
    return;
  }

  const workerId = randomUUID();
  input.logger.info('worker starting', {
    workerId,
    pollIntervalMs: input.config.jobs.pollIntervalMs,
    batchSize: input.config.jobs.batchSize,
  });
  input.logger.warn('cents automatic reconciliation unsupported', {
    mode: 'manual_replay_only',
    reason: 'verified_cents_read_api_unavailable',
  });

  const jobs = composeWorkerJobs({
    databaseUrl: input.config.databaseUrl,
    workerId,
    config: input.config.jobs,
    logger: input.logger,
    counters: input.counters,
    measurements: input.measurements,
    errors: input.errors,
  });
  const lifecycle = startWorkerLifecycle(input.logger);

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
          input.counters.increment('worker.loop_failures', {
            operation: 'worker_loop',
          });
          if ((consecutiveFailures & (consecutiveFailures - 1)) === 0)
            input.logger.warn('worker loop remains unavailable', {
              consecutiveFailures,
              retryDelayMs,
            });
        }
      },
    });
  } finally {
    lifecycle.dispose();
    await jobs.close();
  }

  input.logger.info('worker stopped', { reason: 'shutdown_requested' });
};
