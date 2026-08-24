import { runJobsHost } from './jobs-host.js';
import { uuidIdSource } from '@pressly/cells/id-source/node';
import { systemClock } from '@pressly/time';
import type { Logger } from '@pressly/logging';
import {
  attemptObservation,
  type CounterSink,
  type ErrorReporter,
  type MeasurementSink,
  type TraceSink,
} from '@pressly/observability';
import type { ExecutableJobCatalog } from '@pressly/cells';
import type { JobExecutionPlatform } from './jobs-host.js';
import type { WorkerConfig } from './runtime/env.js';
import { startWorkerLifecycle } from './process-lifecycle.js';
import { makeDurableJobExecution } from './durable-execution.js';
import {
  isRetryableAppError,
  makeFileHeartbeat,
  makeWorkerDurableJobObserver,
  makeWorkerSentryHeartbeat,
} from './runtime-support.js';

export type JobsProcessAssembly = Readonly<{
  catalog: ExecutableJobCatalog;
  execution: JobExecutionPlatform;
}>;

export type JobsProcessCompositionInput = Readonly<{
  databaseUrl: string;
  workerId: string;
  sentryEnabled: boolean;
  config: WorkerConfig['jobs'];
  logger: Logger;
  counters: CounterSink;
  measurements: MeasurementSink;
  errors: ErrorReporter;
  trace: TraceSink;
  nowNanoseconds: () => bigint;
  random: () => number;
  clock: typeof systemClock;
  ids: typeof uuidIdSource;
  mechanisms: Readonly<{
    makeDurableJobExecution: typeof makeDurableJobExecution;
    isRetryableAppError: typeof isRetryableAppError;
    makeFileHeartbeat: typeof makeFileHeartbeat;
    makeWorkerDurableJobObserver: typeof makeWorkerDurableJobObserver;
    makeWorkerSentryHeartbeat: typeof makeWorkerSentryHeartbeat;
  }>;
}>;

export const runWorker = async (input: {
  config: WorkerConfig;
  logger: Logger;
  counters: CounterSink;
  measurements: MeasurementSink;
  errors: ErrorReporter;
  trace: TraceSink;
  composeJobs: (input: JobsProcessCompositionInput) => JobsProcessAssembly;
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

  const jobs = input.composeJobs({
    databaseUrl: input.config.databaseUrl,
    workerId,
    sentryEnabled: input.config.observability.sentry.enabled,
    config: input.config.jobs,
    logger: input.logger,
    counters: input.counters,
    measurements: input.measurements,
    errors: input.errors,
    trace: input.trace,
    nowNanoseconds: process.hrtime.bigint,
    random: Math.random,
    clock: systemClock,
    ids: uuidIdSource,
    mechanisms: {
      makeDurableJobExecution,
      isRetryableAppError,
      makeFileHeartbeat,
      makeWorkerDurableJobObserver,
      makeWorkerSentryHeartbeat,
    },
  });

  await runJobsHost({
    catalog: jobs.catalog,
    dependencies: {
      execution: jobs.execution,
      startLifecycle: () => {
        const lifecycle = startWorkerLifecycle(input.logger);
        return {
          signal: lifecycle.signal,
          dispose: async () => lifecycle.dispose(),
        };
      },
    },
  });

  attemptObservation(() =>
    input.logger.info('worker stopped', { reason: 'shutdown_requested' }),
  );
};
