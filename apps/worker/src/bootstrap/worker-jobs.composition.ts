import { randomUUID } from 'node:crypto';
import { createDatabaseRuntime } from '@pressly/db';
import type { Logger } from '@pressly/logging';
import type {
  CounterSink,
  ErrorReporter,
  MeasurementSink,
} from '@pressly/metrics';
import { makePostgresOrdersWorkerApplication } from '@pressly/orders';
import { makePostgresProductionApplication } from '@pressly/production';
import { makeProductionPolicy } from '@pressly/production-policy';
import { makeProductionScheduler } from '@pressly/production-scheduling';
import { makePostgresWebhookIngestionApplication } from '@pressly/webhook-ingestion';
import { makeIgnoredCentsEventHandler } from '../jobs/process-webhook-inbox/cents/cents-ignored.handler.js';
import { makeCentsOrderHandler } from '../jobs/process-webhook-inbox/cents/cents-order.handler.js';
import { makeWebhookEventDispatcher } from '../jobs/process-webhook-inbox/webhook-event.dispatcher.js';
import { makeWebhookInboxJob } from '../jobs/process-webhook-inbox/webhook-inbox.job.js';
import { makeFulfillmentDemandProjectionJob } from '../jobs/project-fulfillment-demand/fulfillment-demand.job.js';
import type { WorkerConfig } from '../runtime/env.js';
import { makeSequentialJob, type WorkerJob } from '../runtime/job.js';
import { makeProductionDomainSignals } from './production-signals.adapter.js';

export type WorkerJobs = Readonly<{
  job: WorkerJob;
  close: () => Promise<void>;
}>;

export const composeWorkerJobs = (input: {
  databaseUrl: string;
  workerId: string;
  config: WorkerConfig['jobs'];
  logger: Logger;
  counters: CounterSink;
  measurements: MeasurementSink;
  errors: ErrorReporter;
}): WorkerJobs => {
  const database = createDatabaseRuntime({
    databaseUrl: input.databaseUrl,
    maxConnections: 5,
  });
  const clock = { now: () => new Date() };
  const production = makePostgresProductionApplication({
    db: database.db,
    policy: makeProductionPolicy(),
    scheduler: makeProductionScheduler(),
    clock,
    ids: { next: () => randomUUID() },
    signals: makeProductionDomainSignals(input.counters),
  });
  const ingestion = makePostgresWebhookIngestionApplication({
    db: database.db,
    clock,
    ids: { next: () => randomUUID() },
  });
  const orders = makePostgresOrdersWorkerApplication({
    db: database.db,
    clock,
  });
  const acknowledgeIgnoredCentsEvent = makeIgnoredCentsEventHandler();

  const webhookInbox = makeWebhookInboxJob({
    ingestion,
    consume: makeWebhookEventDispatcher({
      'cents:order': makeCentsOrderHandler({
        resolveSourceLocation: ingestion.resolveSourceLocation,
        orders: {
          proposeIncomingOrder: orders.proposeIncomingOrder,
          closeIncomingOrderSource: orders.closeIncomingOrderSource,
        },
        production: {
          resolveSourceClosedFulfillment:
            production.resolveSourceClosedFulfillment,
        },
      }),
      'cents:customer': acknowledgeIgnoredCentsEvent,
      'cents:marketing': acknowledgeIgnoredCentsEvent,
    }),
    clock,
    random: Math.random,
    logger: input.logger,
    counters: input.counters,
    measurements: input.measurements,
    errors: input.errors,
    config: {
      workerId: input.workerId,
      leaseMs: input.config.leaseMs,
      batchSize: input.config.batchSize,
      maxAttempts: input.config.maxAttempts,
      retryBaseMs: input.config.retryBaseMs,
      retryMaxMs: input.config.retryMaxMs,
      backlogMeasurementIntervalMs: input.config.metricLogIntervalMs,
    },
  });

  const fulfillmentDemandProjection = makeFulfillmentDemandProjectionJob({
    orders,
    production,
    clock,
    random: Math.random,
    logger: input.logger,
    counters: input.counters,
    errors: input.errors,
    config: {
      workerId: input.workerId,
      leaseMs: input.config.leaseMs,
      batchSize: input.config.batchSize,
      maxAttempts: input.config.maxAttempts,
      retryBaseMs: input.config.retryBaseMs,
      retryMaxMs: input.config.retryMaxMs,
    },
  });

  return {
    job: makeSequentialJob([webhookInbox, fulfillmentDemandProjection]),
    close: database.close,
  };
};
