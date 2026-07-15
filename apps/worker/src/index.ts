import { randomUUID } from 'node:crypto';
import { createDatabaseRuntime } from '@pressly/db';
import { makeJsonLogger } from '@pressly/logging';
import { makePostgresProductionApplication } from '@pressly/production';
import { makeProductionPolicy } from '@pressly/production-policy';
import { makeProductionScheduler } from '@pressly/production-scheduling';
import { makePostgresWebhookIngestionApplication } from '@pressly/webhook-ingestion';
import { workerEnv } from './common/env.js';
import { makeFileHeartbeat } from './common/heartbeat.js';
import {
  initializeWorkerSentry,
  makeWorkerSentryHeartbeat,
  makeWorkerSentryReporter,
  makeWorkerSignalSinks,
  reportWorkerFailure,
} from './common/observability.js';
import { makeWebhookEventDispatcher } from './lpms/consumer.js';
import { makeInboxProcessor } from './lpms/processor.js';
import { makeProductionDomainSignals } from './lpms/production-signals.js';
import { runInboxLoop } from './lpms/runtime.js';
import { makeCentsOrderConsumer } from './vendors/cents/cents-order.consumer.js';

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
  if (!workerEnv.features.jobsEnabled) {
    logger.warn('worker jobs disabled', { environment: workerEnv.nodeEnv });
    return;
  }

  const workerId = randomUUID();
  logger.info('worker starting', {
    workerId,
    pollIntervalMs: workerEnv.jobs.pollIntervalMs,
    batchSize: workerEnv.jobs.batchSize,
  });
  logger.warn('cents automatic reconciliation unsupported', {
    mode: 'manual_replay_only',
    reason: 'verified_cents_read_api_unavailable',
  });
  const database = createDatabaseRuntime({
    databaseUrl: workerEnv.databaseUrl,
    maxConnections: 5,
  });
  const clock = { now: () => new Date() };
  const application = makePostgresProductionApplication({
    db: database.db,
    policy: makeProductionPolicy(),
    scheduler: makeProductionScheduler(),
    clock,
    ids: { next: () => randomUUID() },
    signals: makeProductionDomainSignals(signals.counters),
  });
  const ingestion = makePostgresWebhookIngestionApplication({
    db: database.db,
    clock,
    ids: { next: () => randomUUID() },
  });
  const controller = new AbortController();
  const stop = (signal: 'SIGINT' | 'SIGTERM') => {
    logger.info('worker shutdown requested', { signal });
    controller.abort();
  };
  const stopOnSigint = () => stop('SIGINT');
  const stopOnSigterm = () => stop('SIGTERM');
  process.once('SIGINT', stopOnSigint);
  process.once('SIGTERM', stopOnSigterm);

  try {
    await runInboxLoop({
      processor: makeInboxProcessor({
        ingestion,
        consume: makeWebhookEventDispatcher({
          'cents:order': makeCentsOrderConsumer({
            resolveSourceLocation: ingestion.resolveSourceLocation,
            applyOrderDemand: application.applyOrderDemand,
          }),
        }),
        clock,
        random: Math.random,
        logger,
        counters: signals.counters,
        measurements: signals.measurements,
        errors,
        config: {
          workerId,
          leaseMs: workerEnv.jobs.leaseMs,
          batchSize: workerEnv.jobs.batchSize,
          maxAttempts: workerEnv.jobs.maxAttempts,
          retryBaseMs: workerEnv.jobs.retryBaseMs,
          retryMaxMs: workerEnv.jobs.retryMaxMs,
          backlogMeasurementIntervalMs: workerEnv.jobs.metricLogIntervalMs,
        },
      }),
      pollIntervalMs: workerEnv.jobs.pollIntervalMs,
      retryBaseMs: workerEnv.jobs.loopRetryBaseMs,
      retryMaxMs: workerEnv.jobs.loopRetryMaxMs,
      signal: controller.signal,
      heartbeat: makeWorkerSentryHeartbeat({
        heartbeat: makeFileHeartbeat({ path: workerEnv.jobs.heartbeatFile }),
        logger,
        sentryEnabled: workerEnv.observability.sentry.enabled,
      }),
      onError: ({ error, consecutiveFailures, retryDelayMs }) => {
        if (consecutiveFailures === 1)
          reportWorkerFailure({
            error,
            operation: 'inbox_loop',
            logger,
            errors,
            counters: signals.counters,
            extra: { consecutiveFailures, retryDelayMs },
          });
        else {
          signals.counters.increment('worker.loop_failures', {
            operation: 'inbox_loop',
          });
          if ((consecutiveFailures & (consecutiveFailures - 1)) === 0)
            logger.warn('worker inbox loop remains unavailable', {
              consecutiveFailures,
              retryDelayMs,
            });
        }
      },
    });
  } finally {
    process.off('SIGINT', stopOnSigint);
    process.off('SIGTERM', stopOnSigterm);
    await database.close();
  }

  logger.info('worker stopped', { reason: 'shutdown_requested' });
};

main()
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
