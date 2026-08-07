import './runtime/observability/instrument.js';
import { runWorker } from './bootstrap/worker-runtime.js';
import { workerEnv } from './runtime/env.js';
import {
  makeWorkerRuntimeLogger,
  makeWorkerSentryReporter,
  makeWorkerSignalSinks,
  makeWorkerTraceSink,
  reportWorkerFailure,
  reportWorkerTelemetryFailure,
} from './runtime/observability/worker-observability.js';

const logger = makeWorkerRuntimeLogger({
  ...workerEnv.observability.sentry,
  environment: workerEnv.nodeEnv,
});

const errors = makeWorkerSentryReporter(workerEnv.observability.sentry.enabled);

const signals = makeWorkerSignalSinks({
  logger,
  measurementLogIntervalMs: workerEnv.jobs.metricLogIntervalMs,
  sentryEnabled: workerEnv.observability.sentry.enabled,
});
const trace = makeWorkerTraceSink(workerEnv.observability.sentry.enabled);

const main = async (): Promise<void> => {
  try {
    await runWorker({
      config: workerEnv,
      logger,
      counters: signals.counters,
      measurements: signals.measurements,
      errors,
      trace,
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
  } catch {
    process.exitCode = 1;
    reportWorkerTelemetryFailure('worker.telemetry.flush_failed');
  }
};

void main().catch(async (error: unknown) => {
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

  try {
    await errors.shutdown();
  } catch {
    reportWorkerTelemetryFailure('worker.telemetry.flush_failed');
  }
});
