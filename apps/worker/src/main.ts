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

runWorker({
  config: workerEnv,
  logger,
  counters: signals.counters,
  measurements: signals.measurements,
  errors,
})
  .then(async () => {
    await errors.shutdown();
  })
  .catch(async (error: unknown) => {
    reportWorkerFailure({
      error,
      operation: 'worker_runtime',
      logger,
      errors,
      counters: signals.counters,
      level: 'fatal',
      tags: { phase: 'fatal' },
    });
    await errors.shutdown();
    process.exitCode = 1;
  });
