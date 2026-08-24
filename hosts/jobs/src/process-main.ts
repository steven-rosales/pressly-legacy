import './runtime/observability/instrument.js';
import {
  runWorker,
  type JobsProcessAssembly,
  type JobsProcessCompositionInput,
} from './process-runtime.js';
import { workerEnv } from './runtime/env.js';
import {
  makeWorkerRuntimeLogger,
  makeWorkerSentryReporter,
  makeWorkerSignalSinks,
  makeWorkerTraceSink,
  reportWorkerFailure,
  reportWorkerTelemetryFailure,
} from './runtime/observability/worker-observability.js';

export type JobsProcessComposer = (
  input: JobsProcessCompositionInput,
) => JobsProcessAssembly;

export type {
  JobsProcessAssembly,
  JobsProcessCompositionInput,
} from './process-runtime.js';

export const runJobsProcess = async (
  composeJobs: JobsProcessComposer,
): Promise<void> => {
  const logger = makeWorkerRuntimeLogger({
    ...workerEnv.observability.sentry,
    environment: workerEnv.nodeEnv,
  });
  const errors = makeWorkerSentryReporter(
    workerEnv.observability.sentry.enabled,
  );
  const signals = makeWorkerSignalSinks({
    logger,
    measurementLogIntervalMs: workerEnv.jobs.metricLogIntervalMs,
    sentryEnabled: workerEnv.observability.sentry.enabled,
  });
  const trace = makeWorkerTraceSink(workerEnv.observability.sentry.enabled);

  try {
    await runWorker({
      config: workerEnv,
      logger,
      counters: signals.counters,
      measurements: signals.measurements,
      errors,
      trace,
      composeJobs,
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
