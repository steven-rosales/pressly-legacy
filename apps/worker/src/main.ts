import { makeJsonLogger } from '@pressly/logging';
import { runWorker } from './bootstrap/worker-runtime.js';
import { workerEnv } from './runtime/env.js';
import {
  initializeWorkerSentry,
  makeWorkerSentryReporter,
  makeWorkerSignalSinks,
  reportWorkerFailure,
} from './runtime/observability/worker-observability.js';

initializeWorkerSentry({
  ...workerEnv.observability.sentry,
  environment: workerEnv.nodeEnv,
});

const logger = makeJsonLogger({
  service: 'pressly-worker',
  environment: workerEnv.nodeEnv,
  ...(workerEnv.observability.sentry.release === undefined
    ? {}
    : { release: workerEnv.observability.sentry.release }),
}).child({ runtime: 'worker' });

const errors = makeWorkerSentryReporter(workerEnv.observability.sentry.enabled);

const signals = makeWorkerSignalSinks({
  logger,
  measurementLogIntervalMs: workerEnv.jobs.metricLogIntervalMs,
  sentryEnabled: workerEnv.observability.sentry.enabled,
});

const main = async (): Promise<void> => {
  try {
    await runWorker({
      config: workerEnv,
      logger,
      counters: signals.counters,
      measurements: signals.measurements,
      errors,
    });
  } catch (error: unknown) {
    process.exitCode = 1;
    reportWorkerFailure({
      error,
      operation: 'worker_runtime',
      logger,
      errors,
      counters: signals.counters,
      level: 'fatal',
      tags: { phase: 'fatal' },
    });
  }

  try {
    await errors.shutdown();
  } catch (error: unknown) {
    process.exitCode = 1;
    reportWorkerFailure({
      error,
      operation: 'worker_error_reporter_shutdown',
      logger,
      errors,
      counters: signals.counters,
      tags: { phase: 'shutdown' },
    });
  }
};

void main().catch((error: unknown) => {
  process.exitCode = 1;
  try {
    reportWorkerFailure({
      error,
      operation: 'worker_main',
      logger,
      errors,
      counters: signals.counters,
      level: 'fatal',
      tags: { phase: 'uncaught' },
    });
  } catch {
    // The process exit code is already set. There is no safer sink left.
  }
});
